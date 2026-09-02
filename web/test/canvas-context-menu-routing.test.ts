import { describe, expect, test } from "bun:test";

import { canvasContextMenuDeleteTarget, canvasContextMenuNodeIds, canvasContextMenuTargetPosition } from "../src/pages/canvas/canvas-context-menu-routing";

describe("画布右键菜单路由", () => {
    test("画布菜单使用世界坐标，节点与连线菜单换算屏幕坐标", () => {
        const screenToCanvas = (x: number, y: number) => ({ x: x - 10, y: y - 20 });
        expect(canvasContextMenuTargetPosition({ type: "canvas", x: 300, y: 200, position: { x: 40, y: 50 } }, screenToCanvas)).toEqual({ x: 40, y: 50 });
        expect(canvasContextMenuTargetPosition({ type: "node", x: 300, y: 200, nodeId: "node-1" }, screenToCanvas)).toEqual({ x: 290, y: 180 });
    });

    test("复制与删除只作用于当前菜单目标", () => {
        const nodeMenu = { type: "node", x: 0, y: 0, nodeId: "node-1" } as const;
        expect([...canvasContextMenuNodeIds(nodeMenu)]).toEqual(["node-1"]);
        expect(canvasContextMenuDeleteTarget(nodeMenu)).toEqual({ type: "node", id: "node-1" });
        expect(canvasContextMenuDeleteTarget({ type: "connection", x: 0, y: 0, connectionId: "edge-1" })).toEqual({ type: "connection", id: "edge-1" });
        expect(canvasContextMenuDeleteTarget({ type: "canvas", x: 0, y: 0, position: { x: 0, y: 0 } })).toBeNull();
    });
});
