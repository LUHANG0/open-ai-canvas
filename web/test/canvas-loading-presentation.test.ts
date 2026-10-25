import assert from "node:assert/strict";
import test from "node:test";
import { canvasLoadingPresentation } from "../src/lib/canvas/canvas-loading-presentation.ts";
import { formatTaskElapsed } from "../src/lib/canvas/task-ticker.ts";
import type { CanvasNodeData } from "../src/types/canvas.ts";

function loading(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id: "fixture", type: "video", title: "video", width: 720, height: 180, position: { x: 0, y: 0 }, metadata: { status: "loading", taskId: "task", taskStatus: "running", taskStage: "作品创作中", taskCreatedAt: "2026-10-25T00:00:00Z", ...metadata } } as CanvasNodeData;
}

test("ordinary processing has one primary state instead of duplicate generic generation labels", () => {
    const result = canvasLoadingPresentation(loading());
    assert.equal(result.title, "生成中"); assert.equal(result.stage, ""); assert.equal(result.progress, null);
    assert.equal(result.active, true);
});

test("submission uncertainty preserves billing/retry meaning and never animates or shows a percentage", () => {
    const result = canvasLoadingPresentation(loading({ taskStage: "submission_unknown", taskProgress: 80 }));
    assert.equal(result.title, "提交结果待确认"); assert.equal(result.stage, "为避免重复扣费，未自动重试");
    assert.equal(result.uncertain, true); assert.equal(result.progress, null); assert.equal(result.active, false);
});

test("queued, creating, model stages and missing start timestamps stay truthful", () => {
    const queued = canvasLoadingPresentation(loading({ taskStatus: "queued", taskStage: "等待队列调度", taskProgress: 30 }));
    assert.equal(queued.title, "排队中"); assert.equal(queued.stage, "正在准备创作"); assert.equal(queued.progress, null);
    const creating = canvasLoadingPresentation(loading({ taskId: undefined, taskStage: "正在准备参考素材", taskCreatedAt: undefined }));
    assert.equal(creating.title, "正在准备"); assert.equal(creating.stage, "正在准备参考素材"); assert.equal(creating.startedAt, undefined);
    const invalid = canvasLoadingPresentation(loading({ taskCreatedAt: "not-a-date" })); assert.equal(invalid.startedAt, undefined);
});

test("only the existing real-progress contract can expose a finite progress bar", () => {
    assert.equal(canvasLoadingPresentation(loading({ taskStage: "generating", taskProgress: 42.5 })).progress, 43);
    for (const progress of [undefined, 0, NaN, Infinity]) assert.equal(canvasLoadingPresentation(loading({ taskStage: "generating", taskProgress: progress })).progress, null);
    assert.equal(canvasLoadingPresentation(loading({ taskStage: "作品创作中", taskProgress: 42 })).progress, null);
});

test("generation success followed by media saving and save failure retain their separate meanings", () => {
    const saving = canvasLoadingPresentation(loading({ taskMediaStage: "download", taskProgress: 100 }));
    assert.equal(saving.title, "作品已生成，正在保存"); assert.equal(saving.stage, "生成成功 · 下载待完成"); assert.equal(saving.progress, null);
    const failed = canvasLoadingPresentation(loading({ taskStatus: "failed", taskMediaStage: "register", taskCompletedAt: "2026-10-25T00:02:00Z" }));
    assert.equal(failed.title, "作品保存未完成"); assert.equal(failed.stage, "生成成功 · 文件保存成功 · 登记素材失败");
    assert.equal(failed.terminal, true); assert.equal(failed.active, false);
    assert.equal(formatTaskElapsed(failed.startedAt, Date.parse("2026-10-25T01:00:00Z"), failed.completedAt), "2分0秒");
});

test("a terminal observation without a completion timestamp does not invent elapsed duration", () => {
    const done = canvasLoadingPresentation(loading({ taskStatus: "succeeded" }));
    assert.equal(done.terminal, true); assert.equal(done.active, false); assert.equal(done.startedAt, undefined);
});

test("layer planning uses its real workflow stage and start time", () => {
    const result = canvasLoadingPresentation(loading({ imageLayerWorkflow: { stage: "planning", startedAt: "2026-10-25T00:01:00Z", total: 3 } as NonNullable<CanvasNodeData["metadata"]>["imageLayerWorkflow"] }));
    assert.equal(result.title, "正在拆解图层"); assert.equal(result.stage, "拆解规划中"); assert.equal(result.startedAt, "2026-10-25T00:01:00Z");
});
