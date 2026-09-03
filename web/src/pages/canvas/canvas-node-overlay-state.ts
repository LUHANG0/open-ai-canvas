import { CanvasNodeType, type CanvasNodeData, type Position } from "@/types/canvas";

export type CanvasOverlayDragPreview = { x: number; y: number; nodeIds: Set<string> } | null;

export function resolveCanvasNodeOverlayDrag(nodeId: string, dragPreview: CanvasOverlayDragPreview, nodeDragging: boolean): { dragOffset: Position | null; isDragging: boolean } {
    const followsDrag = Boolean(dragPreview?.nodeIds.has(nodeId));
    return {
        dragOffset: followsDrag && dragPreview ? { x: dragPreview.x, y: dragPreview.y } : null,
        isDragging: nodeDragging && followsDrag,
    };
}

export function canRenderCanvasInlineNodePanel(node: CanvasNodeData | null, selectionActive: boolean) {
    return Boolean(node && node.type !== CanvasNodeType.Script && node.type !== CanvasNodeType.Drawing && !selectionActive);
}
