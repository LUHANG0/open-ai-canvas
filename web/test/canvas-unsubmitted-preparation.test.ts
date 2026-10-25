import assert from "node:assert/strict";
import test from "node:test";
import { restoreUnsubmittedCanvasPreparation } from "../src/lib/canvas/canvas-node-task-state.ts";
import type { CanvasNodeData } from "../src/types/canvas.ts";

const source = { id: "image", type: "image", title: "image", width: 400, height: 400, position: { x: 0, y: 0 }, metadata: { model: "a", size: "9:16", status: "idle" } } as CanvasNodeData;
function preparing(): CanvasNodeData { return { ...source, metadata: { ...source.metadata, model: "b", size: "16:9", prompt: "new prompt", status: "loading", taskStage: "正在准备参考素材", taskProgress: 0, taskCreatedAt: "fixture" } }; }

test("unsubmitted preparation is released while newer model, parameters and prompt are preserved", () => {
    const restored = restoreUnsubmittedCanvasPreparation(preparing(), source);
    assert.equal(restored.metadata?.status, "idle");
    assert.equal(restored.metadata?.taskStage, undefined);
    assert.equal(restored.metadata?.taskCreatedAt, undefined);
    assert.equal(restored.metadata?.model, "b");
    assert.equal(restored.metadata?.size, "16:9");
    assert.equal(restored.metadata?.prompt, "new prompt");
});

test("newly created tasks and live task states are never reset by an older preparation rejection", () => {
    for (const patch of [{ taskId: "new-task" }, { taskStatus: "running" }, { taskStatus: "queued" }] as const) {
        const node = preparing(); Object.assign(node.metadata!, patch);
        assert.equal(restoreUnsubmittedCanvasPreparation(node, source), node);
    }
});

test("successful media, another node and a later preparation stage remain untouched", () => {
    for (const node of [
        { ...preparing(), id: "other" },
        { ...preparing(), metadata: { ...preparing().metadata, content: "saved-media", status: "success" as const } },
        { ...preparing(), metadata: { ...preparing().metadata, taskStage: "正在准备生成任务" } },
    ]) assert.equal(restoreUnsubmittedCanvasPreparation(node, source), node);
});
