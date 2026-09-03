import { describe, expect, test } from "bun:test";
import { clearDeletedNodeId, closeDeletedNodeContextMenu, filterDeletedNodeScrollOffsets } from "../src/pages/canvas/use-canvas-deleted-node-cleanup";

describe("画布节点删除后的界面清理", () => {
    const removedIds = new Set(["removed"]);

    test("只关闭指向已删除节点的面板", () => {
        expect(clearDeletedNodeId("removed", removedIds)).toBeNull();
        expect(clearDeletedNodeId("kept", removedIds)).toBe("kept");
        expect(clearDeletedNodeId(null, removedIds)).toBeNull();
    });

    test("只移除已删除节点的脚本滚动记录", () => {
        expect(filterDeletedNodeScrollOffsets({ removed: 120, kept: 36 }, removedIds)).toEqual({ kept: 36 });
    });

    test("节点右键菜单随目标删除关闭，画布菜单不受影响", () => {
        expect(closeDeletedNodeContextMenu({ type: "node", x: 10, y: 20, nodeId: "removed" }, removedIds)).toBeNull();
        expect(closeDeletedNodeContextMenu({ type: "node", x: 10, y: 20, nodeId: "kept" }, removedIds)).toEqual({ type: "node", x: 10, y: 20, nodeId: "kept" });
        expect(closeDeletedNodeContextMenu({ type: "canvas", x: 10, y: 20, position: { x: 1, y: 2 } }, removedIds)).toEqual({ type: "canvas", x: 10, y: 20, position: { x: 1, y: 2 } });
    });
});
