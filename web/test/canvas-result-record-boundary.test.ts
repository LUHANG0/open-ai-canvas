import { afterEach, expect, spyOn, test } from "bun:test";
import { applyGeneratedMediaResultMetadata, applyGenerationTaskResultToNodes, buildGenerationTaskNodeResult } from "../src/lib/canvas/canvas-generation-task-sync";
import { reconcileImageBatchRoot } from "../src/lib/canvas/canvas-image-batch-retry";
import { canvasPersistentNodes } from "../src/lib/canvas/canvas-persistent-nodes";
import { canvasResultRecord } from "../src/lib/canvas/canvas-result-record";
import * as cache from "../src/services/resource-blob-cache";
import * as files from "../src/services/file-storage";
import * as images from "../src/services/image-storage";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { GenerationTask } from "../src/services/api/task-center";

const restores: Array<() => void> = [];
afterEach(() => restores.splice(0).forEach((restore) => restore()));
const timing = { startedAt: "2026-10-25T00:00:00Z", completedAt: "2026-10-25T00:02:38Z" };
function task(patch: Partial<GenerationTask> = {}): GenerationTask { return { id: "task", type: "canvas_video", status: "succeeded", prompt: "keep", model: "task-model", attempts: 1, createdAt: timing.startedAt, updatedAt: timing.completedAt, ...timing, billing: { amountMicrocredits: 10_000_000, actualAmountMicrocredits: 8_800_000, status: "settled" }, resultJson: JSON.stringify({ video: { storageKey: "resource:fixture", dataUrl: "/fixture.mp4", width: 1280, height: 720, durationMs: 15000 } }), ...patch }; }
function node(): CanvasNodeData { return { id: "fixture", type: CanvasNodeType.Video, title: "video", width: 420, height: 746, position: { x: 10, y: 20 }, metadata: { taskId: "task", status: "loading", model: "next-editable-model", producedModelCandidate: "submitted-model" } }; }

test("the real completed video path persists only media-bound actual cost and real task times alongside aspect fitting", async () => {
    const blob = spyOn(cache, "getCachedResourceBlob").mockResolvedValue(new Blob(["fixture"], { type: "video/mp4" }));
    const url = spyOn(files, "resolveVideoMediaUrl").mockResolvedValue("/fixture.mp4");
    restores.push(() => blob.mockRestore(), () => url.mockRestore());
    const result = await buildGenerationTaskNodeResult(node(), task());
    expect(result.width / result.height).toBeCloseTo(16 / 9, 8);
    expect(result.metadata?.resultRecord?.billing).toEqual({ actualAmountMicrocredits: 8_800_000, scope: "result" });
    expect(result.metadata?.resultRecord?.model).toBe("task-model");
    expect(canvasResultRecord(result)?.facts).toEqual(["分辨率未记录", "16:9", "任务耗时 2分38秒", "8.8积分"]);
    expect(canvasResultRecord(result)?.details).toContain("1280×720 · 16:9");
    const submitted = await buildGenerationTaskNodeResult(node(), task({ submittedMediaSpec: { resolution: "1080p", aspectRatio: "16:9" } }));
    expect(canvasResultRecord(submitted)?.facts[0]).toBe("分辨率 1080P");
    expect(canvasResultRecord(submitted)?.details).toContain("1280×720 · 16:9");
    expect(canvasPersistentNodes([result])[0].metadata?.resultRecord).toEqual(result.metadata?.resultRecord);
    const nextMedia = applyGeneratedMediaResultMetadata(result, { storageKey: "resource:other", content: "/other", status: "success" }, {}, "other-model");
    expect(nextMedia.resultRecord).toBeUndefined();
});

test("real multiple image results record a task total and the selected cover copies the exact primary's provenance", async () => {
    const url = spyOn(images, "resolveImageUrl").mockResolvedValue("/fixture.png"); restores.push(() => url.mockRestore());
    const before = { ...node(), type: CanvasNodeType.Image };
    const completed = task({ type: "canvas_image", resultJson: JSON.stringify({ images: [0, 1].map((index) => ({ storageKey: `resource:image-${index}`, dataUrl: `/image-${index}`, width: 2048, height: 2048 })) }) });
    const applied = await applyGenerationTaskResultToNodes([before], completed, before.id);
    expect(applied.additionalNodes).toHaveLength(2);
    for (const child of applied.additionalNodes) {
        expect(child.metadata?.resultRecord?.billing?.scope).toBe("task");
        expect(canvasResultRecord(child)?.facts).toEqual(["2K", "1:1"]);
        expect(canvasResultRecord(child)?.model).toBe("");
    }
    expect(canvasResultRecord(applied.node!)?.facts.at(-1)).toBe("本次任务合计 · 8.8积分");
    const second = applied.additionalNodes[1];
    const cover = reconcileImageBatchRoot({ ...applied.node!, metadata: { ...applied.node!.metadata, primaryImageId: second.id } }, applied.nodes);
    expect(cover.metadata?.resultRecord).toBe(second.metadata?.resultRecord);
    expect(cover.metadata?.resultRecord?.mediaKey).toBe(cover.metadata?.storageKey);
});

test("pending and unknown billing remain distinguishable without displaying the original order amount", async () => {
    const blob = spyOn(cache, "getCachedResourceBlob").mockResolvedValue(new Blob(["fixture"]));
    const url = spyOn(files, "resolveVideoMediaUrl").mockResolvedValue("/fixture.mp4");
    restores.push(() => blob.mockRestore(), () => url.mockRestore());
    for (const billing of [undefined, { status: "settled" as const, amountMicrocredits: 10_000_000 }, { status: "reserved" as const, amountMicrocredits: 10_000_000, actualAmountMicrocredits: 8_800_000 }]) {
        const result = await buildGenerationTaskNodeResult(node(), task({ billing }));
        expect(canvasResultRecord(result)?.facts.some((fact) => fact.includes("积分"))).toBe(false);
        expect(canvasResultRecord(result)?.facts.at(-1)).toBe(billing?.status === "reserved" ? "结算中" : "费用未知");
    }
});
