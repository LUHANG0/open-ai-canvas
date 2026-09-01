import type { CanvasNodeData } from "@/types/canvas";

export type CanvasRenderBounds = { left: number; top: number; right: number; bottom: number };

/** 选中状态与 DOM 挂载分离；只按移动后的真实几何范围决定普通节点是否渲染。 */
export function canvasNodeIntersectsRenderBounds(node: CanvasNodeData, bounds: CanvasRenderBounds, dragOffset?: { x: number; y: number } | null) {
    const x = node.position.x + (dragOffset?.x || 0);
    const y = node.position.y + (dragOffset?.y || 0);
    return x + node.width > bounds.left && x < bounds.right && y + node.height > bounds.top && y < bounds.bottom;
}
