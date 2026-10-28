import { expect, test } from "bun:test";
import { applyCanvasVideoDuration, videoMeasurementSnapshot } from "../src/lib/canvas/canvas-video-presentation";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
const node = (durationMs?: number): CanvasNodeData => ({ id: "video", type: CanvasNodeType.Video, position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { storageKey: "resource:original", taskId: "task", status: "success", durationMs } });
test("backfills missing and invalid video duration without changing geometry or overwriting known duration", () => {
    for (const duration of [undefined, 0, -100, Number.NaN]) {
        const current = node(duration);
        const result = applyCanvasVideoDuration(current, videoMeasurementSnapshot(current, "user-a"), 3.125, "user-a");
        expect(result.metadata?.durationMs).toBe(3125);
        expect(result.position).toBe(current.position);
        expect(result.width).toBe(current.width);
    }
    const current = node(4000);
    expect(applyCanvasVideoDuration(current, videoMeasurementSnapshot(current, "user-a"), 3, "user-a")).toBe(current);
});
test("late metadata cannot update a replacement media, a new task or a different account", () => {
    const original = node(); const observed = videoMeasurementSnapshot(original, "user-a");
    for (const current of [ { ...original, metadata: { ...original.metadata, storageKey: "resource:new" } }, { ...original, metadata: { ...original.metadata, taskId: "new-task" } }, { ...original, metadata: { ...original.metadata, status: "loading" as const } } ]) expect(applyCanvasVideoDuration(current, observed, 3, "user-a")).toBe(current);
    expect(applyCanvasVideoDuration(original, observed, 3, "user-b")).toBe(original);
    for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) expect(applyCanvasVideoDuration(original, observed, duration, "user-a")).toBe(original);
});
