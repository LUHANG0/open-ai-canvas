import { isFrameNode } from "@/lib/canvas/canvas-frame";
import type { CanvasNodeData } from "@/types/canvas";

export type CanvasNodeStackOrder = string[];

/**
 * Keeps the most recently interacted node at the end of the paint order.
 * This is session-local UI state and is intentionally not persisted with the
 * canvas document.
 */
export function bringCanvasNodeToFront(order: CanvasNodeStackOrder, nodeId: string): CanvasNodeStackOrder {
    if (!nodeId) return order;
    if (order.at(-1) === nodeId) return order;
    return [...order.filter((id) => id !== nodeId), nodeId];
}

/**
 * Applies the interaction order while preserving the relative order of nodes
 * that have not been interacted with yet.
 */
export function sortCanvasNodesByStackOrder<T extends { id: string }>(nodes: T[], order: CanvasNodeStackOrder): T[] {
    if (nodes.length < 2 || order.length === 0) return nodes;
    const rankById = new Map(order.map((id, index) => [id, index]));
    return nodes
        .map((node, index) => ({ node, index, rank: rankById.get(node.id) ?? -1 }))
        .sort((left, right) => left.rank - right.rank || left.index - right.index)
        .map(({ node }) => node);
}

/** Viewport queries choose membership, never DOM order. Only current document IDs may render. */
export function sortCanvasNodesForRendering(nodes: CanvasNodeData[], documentOrder: ReadonlyMap<string, number>, order: CanvasNodeStackOrder): CanvasNodeData[] {
    const frames: CanvasNodeData[] = [];
    const regular: CanvasNodeData[] = [];
    for (const node of nodes) {
        if (!documentOrder.has(node.id)) continue;
        (isFrameNode(node) ? frames : regular).push(node);
    }
    frames.sort((left, right) => documentOrder.get(left.id)! - documentOrder.get(right.id)!);
    regular.sort((left, right) => documentOrder.get(left.id)! - documentOrder.get(right.id)!);
    return [...frames, ...sortCanvasNodesByStackOrder(regular, order)];
}
