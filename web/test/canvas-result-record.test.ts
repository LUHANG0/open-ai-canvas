import { expect, test } from "bun:test";
import { canvasResultRecord, completedCanvasResultRecord, completedGenerationResultRecord, reconcileResultBilling, reconcileCanvasResultBilling, resultAspectRatio, resultElapsed, resultResolution } from "../src/lib/canvas/canvas-result-record";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { GenerationTask } from "../src/services/api/task-center";
import { useConfigStore } from "../src/stores/use-config-store";

import { applyResourceReference } from "../src/services/user-data-sync-media";
const media = { storageKey: "resource:result", content: "/result", naturalWidth: 1280, naturalHeight: 720, durationMs: 15000, status: "success" as const };
const task: GenerationTask = { id: "task-a", type: "canvas_video", status: "succeeded", model: "actual-model", prompt: "", attempts: 1, createdAt: "2026-10-25T00:00:00Z", startedAt: "2026-10-25T00:00:30Z", completedAt: "2026-10-25T00:02:38Z", updatedAt: "2026-10-25T00:02:38Z", mediaStage: "completed", submittedMediaSpec: { resolution: "720p", aspectRatio: "16:9" } };
function node(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id: "result", type: CanvasNodeType.Video, title: "result", width: 320, height: 180, position: { x: 0, y: 0 }, metadata: { ...media, producedModel: "old-submission", ...metadata } };
}

test("delivered task model, raster and queue-through-save time survive edited settings, new failed task and URL renewal", () => {
    const resultRecord = completedGenerationResultRecord(task, media, 1)!;
    const before = canvasResultRecord(node({ resultRecord }))!;
    expect(before.model).toBe("actual-model");
    expect(before.facts).toContain("分辨率 720P");
    expect(before.facts).toContain("总耗时 2分38秒");
    expect(before.details).toContain("1280×720 · 16:9");
    expect(before.details).toContain("时长 15秒");
    expect(canvasResultRecord(node({ resultRecord, model: "next-model", size: "9:16", seconds: "90", taskId: "retry-b", taskStatus: "failed", content: "/renewed" }))).toEqual(before);
    expect(canvasResultRecord(node({ resultRecord, storageKey: "resource:replacement" }))).toBeNull();
});

test("public display name is frozen at completion, not looked up from a later editable catalogue", () => {
    const config = useConfigStore.getState().config;
    try {
        useConfigStore.setState({ config: { ...config, channels: [{ id: "system", scope: "system", modelCosts: [{ model: "actual-model", displayName: "公开模型名" }] }] as never } });
        const snapshot = completedGenerationResultRecord(task, media, 1)!;
        useConfigStore.setState({ config });
        expect(snapshot.model).toBe("公开模型名");
        expect(canvasResultRecord(node({ resultRecord: snapshot }))?.model).toBe("公开模型名");
        expect(JSON.stringify(snapshot)).not.toContain("modelCosts");
    } finally { useConfigStore.setState({ config }); }
});

test("unknown, pending, explicit settled zero and exact microcredits are distinct from reserved amount", () => {
    for (const [billing, expected] of [
        [undefined, "费用未知"],
        [{ status: "settled", amountMicrocredits: 9000000 }, "费用未知"],
        [{ status: "reserved", amountMicrocredits: 9000000, actualAmountMicrocredits: 8 }, "结算中"],
        [{ status: "uncertain", amountMicrocredits: 9000000 }, "结算中"],
        [{ status: "settled", amountMicrocredits: 9000000, actualAmountMicrocredits: 0 }, "0积分"],
        [{ status: "settled", amountMicrocredits: 9000000, actualAmountMicrocredits: 8800001 }, "8.800001积分"],
        [{ status: "settled", amountMicrocredits: 9000000, actualAmountMicrocredits: -1 }, "费用未知"],
    ] as const) {
        const record = completedGenerationResultRecord({ ...task, billing }, media, 1);
        expect(canvasResultRecord(node({ resultRecord: record }))?.facts.at(-1)).toBe(expected);
        expect(JSON.stringify(record)).not.toContain("amountMicrocredits");
    }
});

test("late settlement refresh is task-bound, immutable and never downgraded by stale reservations", () => {
    const pendingTask = { ...task, billing: { status: "running" as const, amountMicrocredits: 9000000 } };
    const pending = completedGenerationResultRecord(pendingTask, media, 1)!;
    const settledTask = { ...task, billing: { status: "settled" as const, amountMicrocredits: 9000000, actualAmountMicrocredits: 0 } };
    expect(reconcileResultBilling(pending, { ...settledTask, id: "retry-b" })).toBe(pending);
    const settled = reconcileResultBilling(pending, settledTask);
    expect(settled.billing?.actualAmountMicrocredits).toBe(0);
    expect(settled.billingStatus).toBeUndefined();
    expect(settled.completedAt).toBe(pending.completedAt);
    expect(reconcileResultBilling(settled, pendingTask)).toBe(settled);
    expect(pending.billingStatus).toBe("pending");
});

test("multi-output canvas task total belongs only to cover, never each child", () => {
    const resultRecord = completedGenerationResultRecord({ ...task, billing: { status: "settled", amountMicrocredits: 10, actualAmountMicrocredits: 8800000 } }, media, 4)!;
    const root = canvasResultRecord(node({ resultRecord, isBatchRoot: true }))!;
    expect(root.model).toBe("actual-model");
    expect(root.facts.at(-1)).toBe("本次任务合计 · 8.8积分");
    const child = canvasResultRecord(node({ resultRecord, batchRootId: "root" }))!;
    expect(child.model).toBe("");
    expect(child.facts).toEqual(["720P", "16:9"]);
    expect(child.details).toContain("任务 ID：task-a");
});

test("legacy and incomplete records never infer observed dimensions or total duration from requested settings", () => {
    const legacy = canvasResultRecord(node({ naturalWidth: undefined, naturalHeight: undefined, durationMs: undefined, vquality: "4k", seconds: "30", size: "16:9", taskDurationMs: 9000 }))!;
    expect(legacy.facts).toEqual(["分辨率未记录", "费用未知"]);
    expect(legacy.details).toEqual([]);
    const generationOnly = completedCanvasResultRecord(media, { taskId: task.id, taskStatus: "succeeded", taskStartedAt: task.startedAt, taskCompletedAt: task.completedAt });
    expect(canvasResultRecord(node({ resultRecord: generationOnly }))?.facts).toContain("生成耗时 2分8秒");
    expect(canvasResultRecord(node({ resultRecord: completedGenerationResultRecord({ ...task, mediaStage: undefined }, media, 1) }))?.facts).toContain("任务耗时 2分38秒");
    expect(completedGenerationResultRecord({ ...task, status: "failed" }, media, 1)).toBeUndefined();
    expect(completedGenerationResultRecord(task, {}, 1)).toBeUndefined();
    expect(canvasResultRecord(node({ status: "loading" }))).toBeNull();
    expect(canvasResultRecord(node({ fileUpload: "uploading" }))).toBeNull();
});

test("video standards include QHD product 2K in both orientations without approximating nearby rasters", () => {
    for (const [width, height, label] of [
        [854, 480, "480P"], [852, 480, "480P"], [640, 480, "480P"],
        [1280, 720, "720P"], [1920, 1080, "1080P"],
        [2048, 1080, "2K"], [2560, 1440, "2K"],
        [3840, 2160, "4K"], [4096, 2160, "4K"],
    ] as const) {
        expect(resultResolution(width, height, true)).toBe(label);
        expect(resultResolution(height, width, true)).toBe(label);
    }
    for (const [width, height] of [[1920, 1088], [2560, 1441], [2559, 1440], [2048, 1152], [3840, 2161], [1234, 777]]) {
        expect(resultResolution(width, height, true)).toBe(`${width}×${height}`);
        expect(resultResolution(height, width, true)).toBe(`${height}×${width}`);
    }
});

test("image K labels retain exact long-edge policy rather than borrowing video tiers", () => {
    for (const [width, height, label] of [[2048, 1536, "2K"], [4096, 2304, "4K"], [2048, 2048, "2K"], [2560, 1440, "2560×1440"], [3840, 2160, "3840×2160"], [2048, 123, "2048×123"]] as const) {
        expect(resultResolution(width, height, false)).toBe(label);
        expect(resultResolution(height, width, false)).toBe(label.includes("×") ? `${height}×${width}` : label);
    }
});

test("aspect and elapsed reject invented values", () => {
    expect(resultAspectRatio(720, 1280)).toBe("9:16");
    expect(resultAspectRatio(1234, 777)).toBe("1234:777");
    expect(resultElapsed(task.completedAt, task.startedAt)).toBeUndefined();
    expect(resultElapsed("invalid", task.completedAt)).toBeUndefined();
    expect(resultElapsed(task.startedAt, undefined)).toBeUndefined();
    expect(resultElapsed(task.startedAt, "2026-10-25T00:00:30.500Z")).toBe("耗时 <1秒");
});

test("local-to-cloud media migration rebases only matching provenance and survives JSON readback", () => {
    const snapshot = completedGenerationResultRecord(task, { ...media, storageKey: "image:guest:local" }, 1)!;
    const migrated = applyResourceReference({ ...media, storageKey: "image:guest:local", resultRecord: snapshot }, "resource:uploaded");
    const restored = JSON.parse(JSON.stringify(migrated));
    expect(restored.resultRecord.mediaKey).toBe("resource:uploaded");
    expect(canvasResultRecord(node(restored))?.facts).toContain("总耗时 2分38秒");
    const stale = applyResourceReference({ ...media, storageKey: "image:guest:other", resultRecord: snapshot }, "resource:uploaded");
    expect(stale.resultRecord).toBe(snapshot);
    expect(canvasResultRecord(node(stale))).toBeNull();
});

test("repeated billing observations do not dirty nodes and stale media identities stay untouched", () => {
    const pendingTask = { ...task, billing: { status: "running" as const, amountMicrocredits: 9000000 } };
    const resultRecord = completedGenerationResultRecord(pendingTask, media, 1)!;
    const nodes = [node({ resultRecord }), node({ resultRecord, storageKey: "resource:replaced" })];
    expect(reconcileCanvasResultBilling(nodes, pendingTask)).toBe(nodes);
    const settledTask = { ...task, billing: { status: "settled" as const, amountMicrocredits: 9000000, actualAmountMicrocredits: 0 } };
    const updated = reconcileCanvasResultBilling(nodes, settledTask);
    expect(updated).not.toBe(nodes);
    expect(updated[0].metadata?.resultRecord?.billing?.actualAmountMicrocredits).toBe(0);
    expect(updated[1]).toBe(nodes[1]);
    expect(reconcileCanvasResultBilling(updated, settledTask)).toBe(updated);
    expect(reconcileCanvasResultBilling(updated, pendingTask)).toBe(updated);
});


test("imported media shows measured resolution and ratio without inventing generation provenance", () => {
    const imported = node({ producedModel: undefined });
    const result = canvasResultRecord(imported)!;
    expect(result.model).toBe("");
    expect(result.facts).toEqual(["720P", "16:9"]);
    expect(canvasResultRecord(node({ producedModel: undefined, naturalWidth: undefined }))).toBeNull();
    expect(canvasResultRecord(node({ producedModel: undefined, taskId: "unfinished", taskStatus: "failed" }))).toBeNull();
});


test("submitted tiers stay frozen independently of output raster and later editor settings", () => {
    for (const tier of ["480p", "2k", "4k"]) {
        const resultRecord = completedGenerationResultRecord({ ...task, submittedMediaSpec: { resolution: tier, aspectRatio: "4:3" } }, { ...media, naturalWidth: 752, naturalHeight: 560 }, 1)!;
        const result = canvasResultRecord(node({ resultRecord, naturalWidth: 752, naturalHeight: 560, vquality: "1080p", size: "9:16" }))!;
        expect(result.facts).toContain(`分辨率 ${tier.toUpperCase()}`);
        expect(result.facts).toContain("4:3");
        expect(result.details.join(" ")).toContain("752×560");
    }
    const legacyTask = { ...task, submittedMediaSpec: undefined };
    const resultRecord = completedGenerationResultRecord(legacyTask, media, 1)!;
    expect(canvasResultRecord(node({ resultRecord, vquality: "4k" }))!.facts).toContain("分辨率未记录");
    const hydrated = reconcileResultBilling(resultRecord, task);
    expect(hydrated.submittedResolution).toBe("720P");
    expect(reconcileResultBilling(hydrated, task)).toBe(hydrated);
    expect(reconcileResultBilling(resultRecord, { ...task, id: "other" })).toBe(resultRecord);
});

test("rounded output dimensions use recognizable aspect ratios", () => {
    expect(resultAspectRatio(752, 560)).toBe("4:3");
    expect(resultAspectRatio(1360, 1024)).toBe("4:3");
    expect(resultAspectRatio(1672, 941)).toBe("16:9");
});
