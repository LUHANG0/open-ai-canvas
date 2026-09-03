import { describe, expect, test } from "bun:test";
import { portraitClearanceInputsFor, synchronizePortraitClearanceInputBindings } from "../src/pages/canvas/use-canvas-portrait-clearance";
import { PORTRAIT_CLEARANCE_NODE_TYPE } from "../src/lib/portrait-clearance/contracts";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, type: CanvasNodeData["type"]): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 320, height: 180 };
}

describe("画布肖像排查协调", () => {
    test("上游输入按连接顺序稳定提供给排查面板", () => {
        const clearance = node("clearance", PORTRAIT_CLEARANCE_NODE_TYPE);
        const first = node("first", CanvasNodeType.Image);
        const second = node("second", CanvasNodeType.Image);
        const connections: CanvasConnection[] = [
            { id: "b", fromNodeId: first.id, toNodeId: clearance.id },
            { id: "a", fromNodeId: second.id, toNodeId: clearance.id },
            { id: "c", fromNodeId: first.id, toNodeId: "other" },
        ];
        expect(portraitClearanceInputsFor(clearance.id, [clearance, first, second], connections).map((item) => item.id)).toEqual(["second", "first"]);
    });

    test("旧排查节点会补齐默认状态并同步输入绑定", () => {
        const clearance = node("clearance", PORTRAIT_CLEARANCE_NODE_TYPE);
        const source = { ...node("source", CanvasNodeType.Image), metadata: { content: "data:image/png;base64,source" } };
        const next = synchronizePortraitClearanceInputBindings([clearance, source], [{ id: "input", fromNodeId: source.id, toNodeId: clearance.id }]);
        expect(next[0].metadata?.portraitClearance).toBeDefined();
        expect(next[0].metadata?.portraitClearance?.inputBindings.map((binding) => binding.nodeId)).toEqual([source.id]);
        expect(next[1]).toBe(source);
    });
});
