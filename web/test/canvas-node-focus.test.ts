import { describe, expect, test } from "bun:test";
import { PORTRAIT_CLEARANCE_NODE_TYPE } from "../src/lib/portrait-clearance/contracts";
import { resolveCanvasNodeClickTarget } from "../src/pages/canvas/use-canvas-node-focus";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeTypeId } from "../src/types/canvas";

function node(id: string, type: CanvasNodeTypeId): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 320, height: 180 };
}

describe("画布节点聚焦规则", () => {
    test("绘图与肖像排查进入独立编辑器，脚本节点不打开通用参数面板", () => {
        expect(resolveCanvasNodeClickTarget(node("drawing", CanvasNodeType.Drawing), "config", CanvasNodeType.Config)).toEqual({ dialogNodeId: null, drawingNodeId: "drawing" });
        expect(resolveCanvasNodeClickTarget(node("portrait", PORTRAIT_CLEARANCE_NODE_TYPE), null)).toEqual({ dialogNodeId: null, portraitClearanceNodeId: "portrait" });
        expect(resolveCanvasNodeClickTarget(node("script", CanvasNodeType.Script), "image", CanvasNodeType.Image)).toEqual({ dialogNodeId: null });
    });

    test("文本与文件夹只保留自己的已开面板，不接管其他节点面板", () => {
        expect(resolveCanvasNodeClickTarget(node("text", CanvasNodeType.Text), "text", CanvasNodeType.Text).dialogNodeId).toBe("text");
        expect(resolveCanvasNodeClickTarget(node("frame", CanvasNodeType.Frame), "other", CanvasNodeType.Image).dialogNodeId).toBeNull();
    });

    test("参考媒体保留正在编辑的生成配置，否则打开自身设置", () => {
        const video = node("video", CanvasNodeType.Video);
        expect(resolveCanvasNodeClickTarget(video, "config", CanvasNodeType.Config).dialogNodeId).toBe("config");
        expect(resolveCanvasNodeClickTarget(video, "image", CanvasNodeType.Image).dialogNodeId).toBe("video");
    });
});
