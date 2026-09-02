import { describe, expect, test } from "bun:test";

import { resolveCanvasNodeSearchRevealTargets } from "../src/pages/canvas/canvas-node-search-routing";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, metadata: CanvasNodeData["metadata"] = {}, parentId?: string): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, parentId, metadata };
}

describe("画布节点搜索定位", () => {
    test("定位前展开折叠的父级画框和图片批次", () => {
        const nodes = [
            node("frame", { frame: { collapsed: true } }),
            node("batch", { imageBatchExpanded: false }),
            node("target", { batchRootId: "batch" }, "frame"),
        ];
        expect(resolveCanvasNodeSearchRevealTargets(new Map(nodes.map((item) => [item.id, item])), "target")).toEqual({ collapsedFrameId: "frame", collapsedBatchRootId: "batch" });
    });

    test("已展开或不存在的容器不触发切换", () => {
        const target = node("target");
        expect(resolveCanvasNodeSearchRevealTargets(new Map([[target.id, target]]), target.id)).toEqual({ collapsedFrameId: undefined, collapsedBatchRootId: undefined });
    });
});
