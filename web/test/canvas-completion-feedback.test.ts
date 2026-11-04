import { expect, test } from "bun:test";
import { CanvasCompletionFeedbackLedger } from "@/lib/canvas/canvas-completion-feedback";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

function node(metadata: CanvasNodeMetadata): CanvasNodeData {
    return { id: "result", title: "Result", type: CanvasNodeType.Image, position: { x: 0, y: 0 }, width: 240, height: 160, metadata };
}
const result = { status: "success", taskId: "task-a", taskStatus: "succeeded", storageKey: "resource:a", content: "/a", taskCompletedAt: "2099-01-01T00:00:00Z", resultRecord: { taskId: "task-a", mediaKey: "resource:a" } } as const;

test("initial historical success and repeated readback never create a completion window", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    ledger.observe([node(result)], 10);
    ledger.observe([node({ ...result, taskCompletedAt: "1900-01-01T00:00:00Z" })], 5000);
    expect(ledger.get("result")).toBeNull();
});

for (const status of ["loading", "error"] as const) {
    test(`${status} to applied success starts once using local time, independent of server clock`, () => {
        const ledger = new CanvasCompletionFeedbackLedger();
        ledger.observe([node({ ...result, status })], 10);
        ledger.observe([node(result)], 100);
        const completion = ledger.get("result");
        expect(completion?.startedAt).toBe(100);
        ledger.observe([node({ ...result, taskCompletedAt: "1900-01-01T00:00:00Z", taskProgress: 100 })], 3000);
        expect(ledger.get("result")).toBe(completion);
    });
}

test("success to success replacement identifies new task and new applied result, not old bound media", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    ledger.observe([node({ ...result, resultRecord: { mediaKey: "resource:a", taskId: "task-a" } })], 10);
    ledger.observe([node({ ...result, taskId: "task-b", resultRecord: { mediaKey: "resource:a", taskId: "task-a" } })], 20);
    expect(ledger.get("result")).toBeNull();
    ledger.observe([node({ ...result, taskId: "task-b", storageKey: "resource:b", resultRecord: { mediaKey: "resource:b", taskId: "task-b" } })], 30);
    expect(ledger.get("result")?.startedAt).toBe(30);
    ledger.observe([node({ ...result, taskId: "task-b", storageKey: "resource:c", resultRecord: { mediaKey: "resource:c", taskId: "task-b" } })], 40);
    expect(ledger.get("result")?.startedAt).toBe(40);
});

test("offscreen result observation retains original window through late readback; new session establishes history", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    ledger.observe([node({ ...result, status: "loading" })], 0);
    ledger.observe([node(result)], 10000);
    const completion = ledger.get("result");
    // No view/LOD consumer needs to be mounted during any observation.
    ledger.observe([node({ ...result })], 14000);
    expect(ledger.get("result")).toBe(completion);
    expect(completion?.startedAt).toBe(10000);
    const nextSession = new CanvasCompletionFeedbackLedger();
    nextSession.observe([node(result)], 14000);
    expect(nextSession.get("result")).toBeNull();
});

test("new completed task nodes notify, while imported media without task provenance does not", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    ledger.observe([], 0);
    ledger.observe([node({ status: "success", content: "/import" })], 10);
    expect(ledger.get("result")).toBeNull();
    ledger.observe([node(result)], 20);
    expect(ledger.get("result")?.startedAt).toBe(20);
});

test("late bookkeeping and effect reordering do not replay an already applied result", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    ledger.observe([node({ ...result, status: "loading" })], 0);
    ledger.observe([node(result)], 100);
    const completion = ledger.get("result");
    ledger.observe([node({ ...result, assetId: "asset-a", generationEffectKeys: ["attach-node:task-a:result:0", "continuation:x"], resultRecord: { taskId: "task-a", mediaKey: "resource:a" } })], 500);
    expect(ledger.get("result")).toBe(completion);
    ledger.observe([node({ ...result, generationEffectKeys: ["continuation:x", "attach-node:task-a:result:0"] })], 1000);
    expect(ledger.get("result")).toBe(completion);
});

test("legacy task binding cannot celebrate existing media before result application", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    ledger.observe([node({ ...result, resultRecord: undefined })], 0);
    ledger.observe([node({ ...result, resultRecord: undefined, taskId: "task-b" })], 100);
    expect(ledger.get("result")).toBeNull();
    ledger.observe([node({ ...result, resultRecord: undefined, taskId: "task-b", generationEffectKeys: ["attach-node:task-b:result:0"] })], 200);
    expect(ledger.get("result")?.startedAt).toBe(200);
});

test("URL authentication refresh is not a new result, but a changed object path is", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    const bare = { ...result, storageKey: undefined, content: "https://media.invalid/object-a?X-Amz-Signature=old&X-Amz-Expires=60" };
    ledger.observe([node(bare)], 0);
    ledger.observe([node({ ...bare, content: "https://media.invalid/object-a?X-Amz-Signature=new&X-Amz-Expires=120" })], 100);
    expect(ledger.get("result")).toBeNull();
    ledger.observe([node({ ...bare, content: "https://media.invalid/object-b?X-Amz-Signature=new" })], 200);
    expect(ledger.get("result")?.startedAt).toBe(200);
});

test("malformed media URL stays local to its node and cannot break observation", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    ledger.observe([node({ ...result, content: "http://[", storageKey: undefined })], 0);
    ledger.observe([node({ ...result, content: "http://[", storageKey: undefined, taskProgress: 100 })], 100);
    expect(ledger.get("result")).toBeNull();
});

test("reused long inline sources keep bounded feedback IDs without truncating result identity", () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    const content = "data:image/png;base64," + "x".repeat(100000);
    const nodes = Array.from({ length: 20 }, (_, index) => ({ ...node({ status: "loading", content }), id: `long-${index}` }));
    ledger.observe(nodes, 0);
    ledger.observe(
        nodes.map((item) => ({ ...item, metadata: { ...item.metadata, status: "success" } })),
        100,
    );
    const feedback = nodes.map((item) => ledger.get(item.id)!);
    expect(feedback.every((item) => typeof item.identity === "number")).toBe(true);
    expect(new Set(feedback.map((item) => item.identity)).size).toBe(20);
    ledger.observe(
        nodes.map((item) => ({ ...item, metadata: { ...item.metadata, status: "success", content: content.slice(0, -1) + "y" } })),
        200,
    );
    expect(ledger.get("long-0")?.startedAt).toBe(200);
    const replacement = ledger.get("long-0");
    ledger.observe(
        nodes.map((item) => ({ ...item, metadata: { ...item.metadata, status: "success", content: content.slice(0, -1) + "y" } })),
        300,
    );
    expect(ledger.get("long-0")).toBe(replacement);
    ledger.observe(
        nodes.map((item) => ({ ...item, metadata: { ...item.metadata, status: "success", taskId: "new-task", resultRecord: { taskId: "new-task", mediaKey: content } } })),
        400,
    );
    expect(ledger.get("long-0")?.startedAt).toBe(400);
});
