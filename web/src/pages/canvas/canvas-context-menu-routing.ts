import type { ContextMenuState, Position } from "@/types/canvas";

export function canvasContextMenuTargetPosition(menu: ContextMenuState, screenToCanvas: (clientX: number, clientY: number) => Position) {
    return menu.type === "canvas" ? menu.position : screenToCanvas(menu.x, menu.y);
}

export function canvasContextMenuNodeIds(menu: ContextMenuState) {
    return menu.type === "node" ? new Set([menu.nodeId]) : new Set<string>();
}

export function canvasContextMenuDeleteTarget(menu: ContextMenuState): { type: "node" | "connection"; id: string } | null {
    if (menu.type === "node") return { type: "node", id: menu.nodeId };
    if (menu.type === "connection") return { type: "connection", id: menu.connectionId };
    return null;
}
