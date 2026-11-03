import { isFrameNode } from "@/lib/canvas/canvas-frame";
import { buildCanvasSpatialIndex, type CanvasSpatialBounds, type CanvasSpatialIndex, type CanvasSpatialIndexEntry } from "@/lib/canvas/canvas-spatial-index";
import { canvasConnectionIndexBounds } from "./canvas-connection-geometry";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

export type CanvasIndexedConnection = { connection: CanvasConnection; fromId: string; toId: string };
export type CanvasConnectionIndex = { index: CanvasSpatialIndex<CanvasIndexedConnection>; connectionIdsByNodeId: Map<string, Set<string>>; entriesById: Map<string, CanvasIndexedConnection> };

/** Store endpoint IDs so text/task updates can use live nodes without rebuilding geometry. */
export function buildCanvasConnectionIndex(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasConnectionIndex {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const entries: CanvasSpatialIndexEntry<CanvasIndexedConnection>[] = [];
    const connectionIdsByNodeId = new Map<string, Set<string>>();
    const collapsedBatchChild = (node: CanvasNodeData) => {
        const root = node.metadata?.batchRootId ? nodeById.get(node.metadata.batchRootId) : undefined;
        return root && !root.metadata?.imageBatchExpanded;
    };
    const endpoint = (node: CanvasNodeData) => {
        const parent = node.parentId ? nodeById.get(node.parentId) : undefined;
        return parent && isFrameNode(parent) && parent.metadata?.frame?.collapsed ? parent : node;
    };
    for (const connection of connections) {
        const source = nodeById.get(connection.fromNodeId);
        const target = nodeById.get(connection.toNodeId);
        if (!source || !target || collapsedBatchChild(source) || collapsedBatchChild(target)) continue;
        const from = endpoint(source),
            to = endpoint(target);
        if (from.id === to.id) continue;
        const value = { connection, fromId: from.id, toId: to.id };
        const bounds = canvasConnectionIndexBounds(connection, from, to);
        if (!bounds) continue;
        entries.push({ id: connection.id, bounds, value });
        for (const nodeId of new Set([source.id, target.id, from.id, to.id])) {
            const ids = connectionIdsByNodeId.get(nodeId) || new Set<string>();
            ids.add(connection.id);
            connectionIdsByNodeId.set(nodeId, ids);
        }
    }
    return { index: buildCanvasSpatialIndex(entries), connectionIdsByNodeId, entriesById: new Map(entries.map((entry) => [entry.id, entry.value])) };
}

/** The budget is only for overscan. Curves crossing the actual viewport and
 * explicitly selected/dragged edges must never be silently truncated. */
export function selectCanvasConnections(index: CanvasConnectionIndex, view: CanvasSpatialBounds, retain: CanvasSpatialBounds, overscanLimit: number, selectedId: string | null, draggedIds?: ReadonlySet<string>) {
    const candidates = new Map<string, CanvasIndexedConnection>();
    for (const item of index.index.query(retain, overscanLimit)) candidates.set(item.connection.id, item);
    for (const item of index.index.query(view)) candidates.set(item.connection.id, item);
    if (selectedId) {
        const item = index.entriesById.get(selectedId);
        if (item) candidates.set(selectedId, item);
    }
    draggedIds?.forEach((nodeId) =>
        index.connectionIdsByNodeId.get(nodeId)?.forEach((id) => {
            const item = index.entriesById.get(id);
            if (item) candidates.set(id, item);
        }),
    );
    return [...candidates.values()];
}
