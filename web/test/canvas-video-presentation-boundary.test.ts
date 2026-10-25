import { afterEach, expect, spyOn, test } from "bun:test";
import { buildGenerationTaskNodeResult } from "../src/lib/canvas/canvas-generation-task-sync";
import { commitCanvasGenerationResult } from "../src/lib/canvas/canvas-generation-result";
import { ensureMediaNodeMinimumSize } from "../src/lib/canvas/canvas-node-size";
import { updateCanvasNodes } from "../src/lib/canvas/canvas-node-timestamps";
import { applyCanvasVideoMeasurement, videoMeasurementSnapshot } from "../src/lib/canvas/canvas-video-presentation";
import * as cache from "../src/services/resource-blob-cache";
import * as files from "../src/services/file-storage";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const restores: Array<() => void> = [];
afterEach(() => restores.splice(0).forEach((restore) => restore()));
function node(): CanvasNodeData { return { id: "fixture", type: CanvasNodeType.Video, title: "video", width: 420, height: 746, position: { x: 10, y: 20 }, metadata: { taskId: "task", size: "9:16", status: "loading" } }; }
function stubMedia() {
    const blob = spyOn(cache, "getCachedResourceBlob").mockResolvedValue(new Blob(["fixture"], { type: "video/mp4" }));
    const url = spyOn(files, "resolveVideoMediaUrl").mockResolvedValue("/fixture.mp4");
    restores.push(() => blob.mockRestore(), () => url.mockRestore());
}
const task = (dimensions = true) => ({ id: "task", type: "canvas_video", status: "succeeded" as const, prompt: "keep", attempts: 1, createdAt: "", updatedAt: "", resultJson: JSON.stringify({ video: { storageKey: "resource:fixture", dataUrl: "/fixture.mp4", ...(dimensions ? { width: 854, height: 480 } : {}) } }) });

test("the actual completed-video path fits known output dimensions and leaves unknown dimensions for later measurement", async () => {
    stubMedia();
    const before = node();
    const result = await buildGenerationTaskNodeResult(before, task());
    expect(result.width).toBe(720); expect(result.width / result.height).toBeCloseTo(854 / 480, 8);
    expect(result.metadata?.size).toBe("9:16"); expect(result.metadata?.naturalWidth).toBe(854);
    const pendingMeasurement = await buildGenerationTaskNodeResult(before, task(false));
    expect(pendingMeasurement.width).toBe(before.width); expect(pendingMeasurement.height).toBe(before.height);
    expect(pendingMeasurement.metadata?.naturalWidth).toBeUndefined();
});

test("completion and the real commit boundary preserve manual geometry and edits made during result preparation", async () => {
    stubMedia();
    for (const flag of ["manualSize", "locked", "freeResize"] as const) {
        const before = node(); before.metadata![flag] = true;
        const result = await buildGenerationTaskNodeResult(before, task());
        expect(result.width).toBe(before.width); expect(result.height).toBe(before.height);
    }
    const before = node(); const result = await buildGenerationTaskNodeResult(before, task());
    const resized = { ...before, width: 300, height: 700, metadata: { ...before.metadata, manualSize: true } };
    expect(commitCanvasGenerationResult([resized], before, result, "task")[0]).toMatchObject({ width: 300, height: 700, position: resized.position, metadata: { manualSize: true, naturalWidth: 854 } });
});

test("loading saved video results uses measured aspect ratio while old manual layouts survive reloading", () => {
    const saved = { ...node(), metadata: { content: "/saved.mp4", naturalWidth: 854, naturalHeight: 480, status: "success" as const } };
    const fitted = ensureMediaNodeMinimumSize(saved);
    expect(fitted.width / fitted.height).toBeCloseTo(854 / 480, 8);
    expect(ensureMediaNodeMinimumSize(fitted)).toBe(fitted);
    for (const flag of ["manualSize", "locked", "freeResize"] as const) {
        const manual = { ...saved, width: 180, height: 300, metadata: { ...saved.metadata, [flag]: true } };
        expect(ensureMediaNodeMinimumSize(manual)).toBe(manual);
    }
});

test("the actual delayed node update boundary neither recreates a deleted node nor stamps repeated measurements", () => {
    const before = { ...node(), metadata: { content: "/saved.mp4", storageKey: "resource:fixture", status: "success" as const } };
    const observation = videoMeasurementSnapshot(before, "fixture-user");
    const updates = new Map([[before.id, (current: CanvasNodeData) => applyCanvasVideoMeasurement(current, observation, { width: 854, height: 480 }, "fixture-user")]]);
    const deleted: CanvasNodeData[] = []; expect(updateCanvasNodes(deleted, updates)).toBe(deleted);
    const fitted = updateCanvasNodes([before], updates, "2026-10-25T00:01:00Z");
    expect(updateCanvasNodes(fitted, updates, "2026-10-25T00:02:00Z")).toBe(fitted);
});
