import { describe, expect, test } from "bun:test";
import { canvasNodePanelKind } from "../src/pages/canvas/canvas-node-panel-routing";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(type: CanvasNodeData["type"]): CanvasNodeData {
    return { id: String(type), type, title: String(type), position: { x: 0, y: 0 }, width: 320, height: 180 };
}

describe("画布节点设置面板分流", () => {
    test("脚本和绘图使用各自独立编辑器，不打开通用设置", () => {
        expect(canvasNodePanelKind(node(CanvasNodeType.Script))).toBeNull();
        expect(canvasNodePanelKind(node(CanvasNodeType.Drawing))).toBeNull();
    });

    test("配置节点打开组合器，其余素材节点打开提示词设置", () => {
        expect(canvasNodePanelKind(node(CanvasNodeType.Config))).toBe("config");
        expect(canvasNodePanelKind(node(CanvasNodeType.Image))).toBe("prompt");
        expect(canvasNodePanelKind(node(CanvasNodeType.Video))).toBe("prompt");
        expect(canvasNodePanelKind(node(CanvasNodeType.Text))).toBe("prompt");
    });
});
