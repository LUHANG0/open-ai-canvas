import { describe, expect, test } from "bun:test";
import { canvasReferenceConnectionIdsToRemove } from "../src/pages/canvas/use-canvas-node-references";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

const nodes: CanvasNodeData[] = [
    { id: "reference", type: CanvasNodeType.Image, title: "参考图", position: { x: 0, y: 0 }, width: 320, height: 180 },
    { id: "target", type: CanvasNodeType.Video, title: "视频生成", position: { x: 400, y: 0 }, width: 320, height: 180 },
    { id: "config", type: CanvasNodeType.Config, title: "生成配置", position: { x: 800, y: 0 }, width: 320, height: 180 },
    { id: "other", type: CanvasNodeType.Video, title: "其他节点", position: { x: 400, y: 300 }, width: 320, height: 180 },
];

const connections: CanvasConnection[] = [
    { id: "reference-target", fromNodeId: "reference", toNodeId: "target" },
    { id: "target-config", fromNodeId: "target", toNodeId: "config" },
    { id: "reference-config", fromNodeId: "reference", toNodeId: "config" },
    { id: "reference-other", fromNodeId: "reference", toNodeId: "other" },
];

describe("画布节点参考关系", () => {
    test("解除参考时删除直连与配置输入边，但保留目标到配置的主链", () => {
        expect(Array.from(canvasReferenceConnectionIdsToRemove("target", "reference", nodes, connections))).toEqual(["reference-target", "reference-config"]);
    });

    test("不会删除同一素材连接到其他生成节点的边", () => {
        const removed = canvasReferenceConnectionIdsToRemove("target", "reference", nodes, connections);
        expect(removed.has("reference-other")).toBeFalse();
        expect(removed.has("target-config")).toBeFalse();
    });
});
