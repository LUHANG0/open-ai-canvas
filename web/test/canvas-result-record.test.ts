import assert from "node:assert/strict";
import test from "node:test";
import { canvasResultRecord, completedCanvasResultRecord, resultAspectRatio, resultElapsed, resultResolution } from "../src/lib/canvas/canvas-result-record.ts";
import type { CanvasNodeData } from "../src/types/canvas.ts";

function node(metadata: CanvasNodeData["metadata"] = {}, type = "video"): CanvasNodeData {
    return { id: "fixture", type, title: "result", width: 320, height: 180, position: { x: 20, y: 40 }, metadata: { content: "/result", storageKey: "resource:result", status: "success", producedModel: "submitted-model", naturalWidth: 1280, naturalHeight: 720, durationMs: 15000, ...metadata } } as CanvasNodeData;
}
const timing = { taskId: "task-a", taskStatus: "succeeded", taskStartedAt: "2026-10-25T00:00:00Z", taskCompletedAt: "2026-10-25T00:02:38Z" };

test("a complete video record projects the delivered model, actual raster, ratio, duration and task elapsed", () => {
    assert.deepEqual(canvasResultRecord(node({ ...timing })), { model: "submitted-model", facts: ["720P", "16:9", "15秒", "耗时 2分38秒"] });
});

test("editing model, ratio, quality, seconds or estimate never changes the old result record", () => {
    const before = node({ ...timing });
    const after = node({ ...before.metadata, model: "next-model", size: "9:16", quality: "4K", vquality: "1080p", seconds: "30", generationSpec: { parameters: { cost: 9999 } } as never });
    assert.deepEqual(canvasResultRecord(after), canvasResultRecord(before));
});

test("frozen media-bound time survives task reset or failed next generation, without reading new task times", () => {
    const before = node();
    const resultRecord = completedCanvasResultRecord(before.metadata!, timing)!;
    const failedNext = node({ resultRecord, taskId: "task-b", taskStatus: "failed", status: "error", taskStartedAt: "2026-10-25T01:00:00Z", taskCompletedAt: "2026-10-25T02:00:00Z" });
    assert.equal(canvasResultRecord(failedNext)?.facts.at(-1), "耗时 2分38秒");
    assert.equal(canvasResultRecord(node({ resultRecord, content: "/renewed?signature=changed" }))?.facts.at(-1), "耗时 2分38秒");
    assert.equal(canvasResultRecord(node({ ...timing, resultRecord, storageKey: "resource:replacement" }))?.facts.some((fact) => fact.startsWith("耗时")), false);
});

test("a completed snapshot requires a succeeded task and actual media identity", () => {
    assert.deepEqual(completedCanvasResultRecord({ storageKey: "resource:result" }, timing), { mediaKey: "resource:result", taskId: "task-a", startedAt: timing.taskStartedAt, completedAt: timing.taskCompletedAt });
    assert.equal(completedCanvasResultRecord({}, timing), undefined);
    assert.equal(completedCanvasResultRecord({ content: "/result" }, { ...timing, taskStatus: "running" }), undefined);
    assert.equal(completedCanvasResultRecord({ content: "/result" }, { taskStatus: "succeeded" }), undefined);
});

test("old results omit missing time and pixels instead of using frame geometry or editable settings", () => {
    assert.deepEqual(canvasResultRecord(node({ naturalWidth: undefined, naturalHeight: undefined, durationMs: undefined, seconds: "15", size: "16:9", vquality: "720p", taskDurationMs: 158000 }))?.facts, []);
    assert.equal(canvasResultRecord(node({ ...timing, taskStartedAt: undefined }))?.facts.some((fact) => fact.startsWith("耗时")), false);
});

test("a proven generated result with no model name retains its known facts without inventing a model", () => {
    assert.deepEqual(canvasResultRecord(node({ ...timing, producedModel: undefined })), { model: "", facts: ["720P", "16:9", "15秒", "耗时 2分38秒"] });
    const resultRecord = completedCanvasResultRecord(node().metadata!, timing)!;
    assert.equal(canvasResultRecord(node({ resultRecord, producedModel: undefined }))?.model, "");
});

test("images omit video duration and classify common exact image K sizes while retaining nonstandard pixels", () => {
    assert.deepEqual(canvasResultRecord(node({ naturalWidth: 2048, naturalHeight: 2048 }, "image"))?.facts, ["2K", "1:1"]);
    assert.deepEqual(canvasResultRecord(node({ naturalWidth: 1234, naturalHeight: 777 }, "image"))?.facts, ["1234×777", "1234:777"]);
    assert.equal(resultResolution(2048, 1536, false), "2K");
    assert.equal(resultResolution(4096, 2304, false), "4K");
    assert.equal(resultResolution(2048, 123, false), "2048×123");
    assert.equal(resultResolution(1920, 1080, false), "1920×1080");
});

test("portrait video preserves oriented ratio and exact raster families, not nearest quality tiers", () => {
    for (const [width, height, label] of [[854, 480, "480P"], [1280, 720, "720P"], [1920, 1080, "1080P"], [2048, 1080, "2K"], [3840, 2160, "4K"], [4096, 2160, "4K"]] as const) {
        assert.equal(resultResolution(width, height, true), label);
        assert.equal(resultResolution(height, width, true), label);
    }
    assert.equal(resultAspectRatio(720, 1280), "9:16");
    assert.equal(resultAspectRatio(854, 480), "16:9");
    assert.equal(resultResolution(1920, 1088, true), "1920×1088");
    assert.equal(resultResolution(2560, 1440, true), "2560×1440");
    assert.equal(resultAspectRatio(1920, 1088), "30:17");
});

test("invalid media measurements and non-finite duration remain omitted", () => {
    for (const value of [0, -1, NaN, Infinity, 123.4]) assert.deepEqual(canvasResultRecord(node({ naturalWidth: value, durationMs: Infinity }))?.facts, []);
    assert.equal(canvasResultRecord(node({ durationMs: 15020 }))?.facts.at(-1), "15.02秒");
});

test("elapsed uses only valid actual start and completion, not createdAt, cached duration or current time", () => {
    assert.equal(resultElapsed(timing.taskStartedAt, timing.taskCompletedAt), "耗时 2分38秒");
    assert.equal(resultElapsed(timing.taskStartedAt, "2026-10-25T01:01:01Z"), "耗时 1小时1分1秒");
    assert.equal(resultElapsed(timing.taskStartedAt, "2026-10-25T00:00:00.500Z"), "耗时 <1秒");
    for (const [start, end] of [[undefined, timing.taskCompletedAt], [timing.taskStartedAt, undefined], ["invalid", timing.taskCompletedAt], [timing.taskCompletedAt, timing.taskStartedAt]]) assert.equal(resultElapsed(start, end), undefined);
});

test("task-level reserved or settled amounts are never reported as a result charge, including multi-output tasks", () => {
    for (const status of ["settled", "reserved", "running", "uncertain", "refunded"]) {
        const value = node({ ...timing, generationOutputCount: 4 });
        Object.assign(value.metadata!, { billing: { status, amountMicrocredits: 8_800_000 } });
        assert.deepEqual(canvasResultRecord(value)?.facts, ["720P", "16:9", "15秒", "耗时 2分38秒"]);
        assert.equal(JSON.stringify(canvasResultRecord(value)).includes("积分"), false);
    }
});

test("a single-output snapshot displays actual settled points, distinct from the original reservation", () => {
    const media = node().metadata!;
    const resultRecord = completedCanvasResultRecord(media, timing, { status: "settled", amountMicrocredits: 10_000_000, actualAmountMicrocredits: 8_800_000 }, 1);
    assert.equal(resultRecord?.billing?.scope, "result");
    assert.equal(canvasResultRecord(node({ resultRecord }))?.facts.at(-1), "8.8积分");
    assert.equal(canvasResultRecord(node({ resultRecord, model: "changed-next-model", taskId: "next-task", taskStatus: "failed" }))?.facts.at(-1), "8.8积分");
});

test("an explicit settled zero differs from missing cost and exact microcredit precision is retained", () => {
    for (const [actual, label] of [[0, "0积分"], [1, "0.000001积分"], [8_800_001, "8.800001积分"]] as const) {
        const resultRecord = completedCanvasResultRecord(node().metadata!, timing, { status: "settled", amountMicrocredits: 10_000_000, actualAmountMicrocredits: actual }, 1);
        assert.equal(canvasResultRecord(node({ resultRecord }))?.facts.at(-1), label);
    }
    assert.equal(completedCanvasResultRecord(node().metadata!, timing, { status: "settled", amountMicrocredits: 10_000_000 }, 1)?.billing, undefined);
});

test("multiple output charges stay a clearly labelled task total, never divided or presented as a result charge", () => {
    const resultRecord = completedCanvasResultRecord(node().metadata!, timing, { status: "settled", amountMicrocredits: 10_000_000, actualAmountMicrocredits: 8_800_000 }, 4);
    assert.equal(resultRecord?.billing?.scope, "task");
    assert.equal(canvasResultRecord(node({ resultRecord }))?.facts.at(-1), "本次任务 8.8积分");
    assert.equal(canvasResultRecord(node({ resultRecord }))?.facts.includes("2.2积分"), false);
});

test("nonsettled, invalid or unassigned costs do not create an actual billing record", () => {
    for (const status of ["reserved", "running", "uncertain", "refunded"] as const) assert.equal(completedCanvasResultRecord(node().metadata!, timing, { status, amountMicrocredits: 10, actualAmountMicrocredits: 5 }, 1)?.billing, undefined);
    for (const count of [undefined, 0, -1, 1.5, NaN]) assert.equal(completedCanvasResultRecord(node().metadata!, timing, { status: "settled", amountMicrocredits: 10, actualAmountMicrocredits: 5 }, count)?.billing, undefined);
    for (const actual of [-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.equal(completedCanvasResultRecord(node().metadata!, timing, { status: "settled", amountMicrocredits: 10, actualAmountMicrocredits: actual }, 1)?.billing, undefined);
});

test("uploaded, loading and unsupported nodes do not gain a generated result row", () => {
    assert.equal(canvasResultRecord(node({ producedModel: undefined })), null);
    assert.equal(canvasResultRecord(node({ status: "loading" })), null);
    assert.equal(canvasResultRecord(node({ fileUpload: "uploading" })), null);
    assert.equal(canvasResultRecord(node({}, "audio")), null);
    assert.equal(canvasResultRecord(node({ content: undefined, storageKey: undefined })), null);
});

test("batch covers and composites cannot borrow a different result's legacy task time", () => {
    assert.equal(canvasResultRecord(node({ ...timing, isBatchRoot: true }))?.facts.some((fact) => fact.startsWith("耗时")), false);
    assert.equal(canvasResultRecord(node({ imageLayerGroup: { width: 1280, height: 720, layers: [] } }, "image")), null);
});

test("record projection leaves geometry, protected flags, result and timestamps untouched", () => {
    for (const flag of ["manualSize", "locked", "freeResize"] as const) {
        const value = node({ [flag]: true, ...timing });
        const before = JSON.stringify(value); canvasResultRecord(value);
        assert.equal(JSON.stringify(value), before);
    }
});
