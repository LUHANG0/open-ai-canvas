import { expect, test } from "bun:test";
import { attachCreationTaskSnapshots, creationTaskFailure, reconcileCreationTaskMessages } from "../src/pages/create/creation-conversations";
import type { CreationConversation, CreationMessage } from "../src/pages/create/creation-types";
import type { GenerationTask } from "../src/services/api/task-center";
import { recoverCreationTextTask } from "../src/services/creation-text-task-recovery";
const message: CreationMessage = { id: "reply", role: "assistant", mode: "image", content: "生成失败", status: "error", taskIds: ["a"], error: "offline", createdAt: "2026-10-29T00:00:00Z" };
const task: GenerationTask = { id: "a", type: "canvas_image", status: "running", prompt: "fixture", attempts: 1, resultJson: JSON.stringify({ images: [{ storageKey: "resource:a", width: 1024, height: 768 }] }), createdAt: message.createdAt, updatedAt: message.createdAt };
const conversation = (update: Partial<CreationMessage> = {}): CreationConversation[] => [{ id: "c", title: "fixture", updatedAt: message.createdAt, messages: [{ ...message, ...update }] }];
const reconcile = (update: Partial<CreationMessage>, tasks: Array<GenerationTask & { creationError?: string; creationResultStorageKeys?: string[] }>) => reconcileCreationTaskMessages({} as never, conversation(update), tasks)[0].messages[0];

test("a running original task revives an interrupted media message without changing its identity", () => {
    const recovered = reconcile({}, [task]);
    expect(recovered.status).toBe("pending");
    expect(recovered.taskIds).toEqual(["a"]);
    expect(recovered.error).toBeUndefined();
});
test("a successful task whose result cannot be read is a sync error rather than a generation failure", () => {
    const recovered = reconcile({}, [{ ...task, status: "succeeded", creationError: "resource offline" }]);
    expect(recovered.status).toBe("error");
    expect(recovered.errorKind).toBe("sync");
    expect(recovered.content).not.toBe("生成失败");
    expect(recovered.taskIds).toEqual(["a"]);
});
test("confirmed terminal failure is classified separately", () => {
    const recovered = reconcile({}, [{ ...task, status: "failed", error: "rejected fixture" }]);
    expect(recovered.errorKind).toBe("task");
    expect(recovered.error).toBe("rejected fixture");
});
test("temporarily unreadable completed text preserves its streamed content and can recover later", () => {
    const current = { ...message, mode: "text" as const, content: "已输出正文" };
    const runtime = { recoverCreationTextTask } as never;
    const interrupted = reconcileCreationTaskMessages(runtime, [{ ...conversation()[0], messages: [current] }], [{ ...task, type: "canvas_text", status: "succeeded", resultJson: "{}" }]);
    expect(interrupted[0].messages[0].content).toBe("已输出正文");
    expect(interrupted[0].messages[0].errorKind).toBe("sync");
    const restored = reconcileCreationTaskMessages(runtime, interrupted, [{ ...task, type: "canvas_text", status: "succeeded", resultJson: JSON.stringify({ text: "完整正文" }) }]);
    expect(restored[0].messages[0].content).toBe("完整正文");
    expect(restored[0].messages[0].status).toBe("done");
});
test("one result cannot finish a two-task message even if provider context was lost", () => {
    const recovered = reconcile({ status: "pending", taskIds: ["a", "b"] }, [{ ...task, status: "succeeded", creationResultStorageKeys: ["resource:a"] }]);
    expect(recovered.status).toBe("pending");
});
test("an unreadable successful result keeps a partial batch recoverable and preserves delivered media", () => {
    const recovered = reconcile({ status: "pending", taskIds: ["a", "b"] }, [
        { ...task, status: "succeeded", creationResultStorageKeys: ["resource:a"] },
        { ...task, id: "b", status: "succeeded", creationError: "resource offline" },
    ]);
    expect(recovered.status).toBe("error");
    expect(recovered.errorKind).toBe("sync");
    expect(recovered.resultStorageKeys).toEqual(["resource:a"]);
    expect(recovered.content).not.toContain("失败");
});
test("a confirmed failed task can finish a partial batch without offering result recovery", () => {
    const recovered = reconcile({ status: "pending", taskIds: ["a", "b"] }, [
        { ...task, status: "succeeded", creationResultStorageKeys: ["resource:a"] },
        { ...task, id: "b", status: "failed", error: "provider rejected" },
    ]);
    expect(recovered.status).toBe("done");
    expect(recovered.errorKind).toBeUndefined();
    expect(recovered.content).toContain("1 张失败");
});
test("failed durable attachment stays recoverable rather than marking media delivered", async () => {
    const runtime = {
        runGenerationConsumer: async (_signal: AbortSignal, operation: (signal: AbortSignal) => unknown) => operation(_signal),
        materializeGenerationTaskAssets: async (task: GenerationTask) => task,
        generationTaskMaterializedUrls: () => [],
        generationTaskMaterializedStorageKeys: () => ["resource:a"],
        consumeGenerationTaskMessage: async () => { throw new Error("history persistence unavailable"); },
    };
    const tasks = await attachCreationTaskSnapshots(runtime as never, [{ ...task, status: "succeeded" }], conversation(), new AbortController().signal, async () => {});
    expect(tasks[0].creationError).toBeTruthy();
    expect(tasks[0].creationResultStorageKeys).toBeUndefined();
    const recovered = reconcile({}, tasks);
    expect(recovered.status).toBe("error");
    expect(recovered.errorKind).toBe("sync");
});
test("successful readback keeps media facts and clears synchronization errors", () => {
    const recovered = reconcile({}, [{ ...task, status: "succeeded", creationResultStorageKeys: ["resource:a"], resultJson: JSON.stringify({ images: [{ storageKey: "resource:a", width: 1024, height: 768 }] }), billing: { status: "settled", actualAmountMicrocredits: 0 } }]);
    expect(recovered.status).toBe("done");
    expect(recovered.resultRecords?.[0].mediaKey).toBe("resource:a");
    expect(recovered.resultRecords?.[0].width).toBe(1024);
    expect(recovered.resultRecords?.[0].billing?.actualAmountMicrocredits).toBe(0);
    expect(recovered.error).toBeUndefined();
});

test("a late task cannot replace a newer binding even if its server context still points to the message", () => {
    const recovered = reconcile({ taskIds: ["new-task"] }, [{ ...task, status: "succeeded", clientContext: { conversationId: "c", messageId: "reply" }, creationResultStorageKeys: ["resource:old"] }]);
    expect(recovered.taskIds).toEqual(["new-task"]);
    expect(recovered.resultStorageKeys).toBeUndefined();
});
test("polling failure remains a sync interruption while the original task is running or already succeeded", () => {
    for (const status of ["running", "queued", "succeeded"] as const) {
        expect(creationTaskFailure([{ ...task, status }], new Error("offline")).errorKind).toBe("sync");
    }
    expect(creationTaskFailure([{ ...task, status: "failed" }], new Error("rejected")).errorKind).toBe("task");
});
test("aborted readback and replaced bindings cannot attach a stale result", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let attached = 0;
    const runtime = {
        runGenerationConsumer: async (_signal: AbortSignal, operation: (signal: AbortSignal) => unknown) => operation(_signal),
        materializeGenerationTaskAssets: async (task: GenerationTask) => { await pending; return task; },
        generationTaskMaterializedUrls: () => [],
        generationTaskMaterializedStorageKeys: () => ["resource:a"],
        consumeGenerationTaskMessage: async () => { attached++; },
    };
    const controller = new AbortController();
    const run = attachCreationTaskSnapshots(runtime as never, [{ ...task, status: "succeeded" }], conversation(), controller.signal, async () => { attached++; });
    controller.abort(); release(); await run;
    expect(attached).toBe(0);
    await attachCreationTaskSnapshots(runtime as never, [{ ...task, status: "succeeded" }], conversation({ taskIds: ["new-task"] }), new AbortController().signal, async () => { attached++; });
    expect(attached).toBe(0);
});
