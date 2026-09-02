import { describe, expect, test } from "bun:test";
import { applyCanvasImportTransaction } from "../src/pages/canvas/use-canvas-project-import";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

function node(id: string): CanvasNodeData {
    return { id, type: CanvasNodeType.Text, title: id, position: { x: 0, y: 0 }, width: 320, height: 180 };
}

function connection(id: string, fromNodeId: string, toNodeId: string): CanvasConnection {
    return { id, fromNodeId, toNodeId };
}

describe("外部画布导入事务", () => {
    test("保存成功时按原有顺序合并节点和连线", async () => {
        const originalNodes = [node("original")];
        const importedNodes = [node("imported")];
        const originalConnections = [connection("original-edge", "original", "original")];
        const importedConnections = [connection("imported-edge", "original", "imported")];
        const nodesRef = { current: originalNodes };
        const connectionsRef = { current: originalConnections };
        let renderedNodes = originalNodes;
        let renderedConnections = originalConnections;

        await applyCanvasImportTransaction({
            source: "LibTV",
            importedNodes,
            importedConnections,
            nodesRef,
            connectionsRef,
            setNodes: (value) => {
                renderedNodes = value;
            },
            setConnections: (value) => {
                renderedConnections = value;
            },
            saveCanvasProject: async () => {
                expect(nodesRef.current.map((item) => item.id)).toEqual(["original", "imported"]);
                expect(connectionsRef.current.map((item) => item.id)).toEqual(["original-edge", "imported-edge"]);
                return true;
            },
        });

        expect(nodesRef.current.map((item) => item.id)).toEqual(["original", "imported"]);
        expect(connectionsRef.current.map((item) => item.id)).toEqual(["original-edge", "imported-edge"]);
        expect(renderedNodes).toBe(nodesRef.current);
        expect(renderedConnections).toBe(connectionsRef.current);
    });

    test("保存失败时恢复导入前引用和页面状态", async () => {
        const originalNodes = [node("original")];
        const originalConnections = [connection("original-edge", "original", "original")];
        const nodesRef = { current: originalNodes };
        const connectionsRef = { current: originalConnections };
        let renderedNodes = originalNodes;
        let renderedConnections = originalConnections;

        const transaction = applyCanvasImportTransaction({
            source: "TapNow",
            importedNodes: [node("imported")],
            importedConnections: [connection("imported-edge", "original", "imported")],
            nodesRef,
            connectionsRef,
            setNodes: (value) => {
                renderedNodes = value;
            },
            setConnections: (value) => {
                renderedConnections = value;
            },
            saveCanvasProject: async () => false,
        });

        await expect(transaction).rejects.toThrow("画布保存失败，已撤销本次 TapNow 导入");
        expect(nodesRef.current).toBe(originalNodes);
        expect(connectionsRef.current).toBe(originalConnections);
        expect(renderedNodes).toBe(originalNodes);
        expect(renderedConnections).toBe(originalConnections);
    });
});
