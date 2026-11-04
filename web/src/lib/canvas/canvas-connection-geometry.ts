import { STORYBOARD_HEADER_HEIGHT, STORYBOARD_ROW_HEIGHT, storyboardTableHeight } from "./canvas-storyboard-layout";
import { batchReferenceHandleY } from "./canvas-batch-table";
import { batchCellAnchor, BATCH_TABLE_HEADER_HEIGHT, BATCH_COLUMN_HEADER_HEIGHT, parseBatchCellHandle, type BatchScroll } from "./canvas-batch-references";
import type { CanvasSpatialBounds } from "./canvas-spatial-index";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

export type CanvasConnectionGeometry = {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    control1: Position;
    control2: Position;
    pathD: string;
    bounds: CanvasSpatialBounds;
};

// One last resolved shape per connection. Weak ownership follows project objects,
// not IDs, so switching projects/accounts cannot retain or reuse another graph.
const geometries = new WeakMap<CanvasConnection, CanvasConnectionGeometry>();
const invalidGeometry: CanvasConnectionGeometry = { startX: 0, startY: 0, endX: 0, endY: 0, control1: { x: 0, y: 0 }, control2: { x: 0, y: 0 }, pathD: "", bounds: { left: 0, top: 0, right: 0, bottom: 0 } };

export function canvasConnectionPath(connection: CanvasConnection, from: CanvasNodeData, to: CanvasNodeData, fromScrollTop = 0, toScrollTop = 0, fromBatchScroll?: BatchScroll, toBatchScroll?: BatchScroll): CanvasConnectionGeometry {
    const fromCell = batchCellAnchor(from, connection.fromHandleId, fromBatchScroll);
    const toCell = batchCellAnchor(to, connection.toHandleId, toBatchScroll);
    if ((parseBatchCellHandle(connection.fromHandleId) && !fromCell) || (parseBatchCellHandle(connection.toHandleId) && !toCell)) return invalidGeometry;
    const startX = fromCell?.x ?? from.position.x + from.width;
    const startY = fromCell?.y ?? connectionHandleY(from, connection.fromHandleId, fromScrollTop);
    const endX = toCell?.x ?? to.position.x;
    const endY = toCell?.y ?? connectionHandleY(to, connection.toHandleId, toScrollTop);
    const previous = geometries.get(connection);
    if (previous && previous.startX === startX && previous.startY === startY && previous.endX === endX && previous.endY === endY) return previous;
    const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
    const control1 = { x: startX + curvature, y: startY },
        control2 = { x: endX - curvature, y: endY };
    const geometry = { startX, startY, endX, endY, control1, control2, pathD: `M ${startX} ${startY} C ${control1.x} ${startY}, ${control2.x} ${endY}, ${endX} ${endY}`, bounds: curveBounds(startX, startY, endX, endY) };
    geometries.set(connection, geometry);
    return geometry;
}

/** This curve's Y controls equal its endpoint Ys: Y is monotone. Solve X's
 * quadratic derivative, not the control-point hull (which is very wide on reverse edges). */
function curveBounds(startX: number, startY: number, endX: number, endY: number): CanvasSpatialBounds {
    const c = Math.max(Math.abs(endX - startX) * 0.5, 50),
        p1 = startX + c,
        p2 = endX - c;
    let left = Math.min(startX, endX),
        right = Math.max(startX, endX);
    const a = -startX + 3 * p1 - 3 * p2 + endX,
        b = 2 * (startX - 2 * p1 + p2),
        d = p1 - startX;
    const include = (t: number) => {
        if (t <= 0 || t >= 1) return;
        const u = 1 - t,
            x = u * u * u * startX + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * endX;
        left = Math.min(left, x);
        right = Math.max(right, x);
    };
    if (Math.abs(a) < 1e-12) {
        if (b) include(-d / b);
    } else {
        const discriminant = b * b - 4 * a * d;
        if (discriminant >= 0) {
            const r = Math.sqrt(discriminant);
            include((-b + r) / (2 * a));
            include((-b - r) / (2 * a));
        }
    }
    // Nonzero bounds also keep horizontal/vertical edges in the spatial index.
    return { left: left - 0.001, right: right + 0.001, top: Math.min(startY, endY) - 0.001, bottom: Math.max(startY, endY) + 0.001 };
}

/** Scroll-independent envelope. Batch cells can scroll in both axes; storyboard
 * rows in Y. X is piecewise affine in the two anchors for each fixed t, split at
 * endX-startX=±100. Its extrema over the anchor rectangle occur at these vertices.
 * Taking exact curve extrema there covers every scroll without a wide control hull. */
export function canvasConnectionIndexBounds(connection: CanvasConnection, from: CanvasNodeData, to: CanvasNodeData): CanvasSpatialBounds | null {
    const geometry = canvasConnectionPath(connection, from, to);
    if (!geometry.pathD) return null;
    const a = anchorRange(from, connection.fromHandleId, geometry.startX, geometry.startY);
    const b = anchorRange(to, connection.toHandleId, geometry.endX, geometry.endY);
    if (!a && !b) return geometry.bounds;
    const ax0 = a?.left ?? geometry.startX,
        ax1 = a?.right ?? geometry.startX;
    const bx0 = b?.left ?? geometry.endX,
        bx1 = b?.right ?? geometry.endX;
    const bounds = { ...geometry.bounds, top: Math.min(a?.top ?? geometry.startY, b?.top ?? geometry.endY) - 0.001, bottom: Math.max(a?.bottom ?? geometry.startY, b?.bottom ?? geometry.endY) + 0.001 };
    const include = (x: number, y: number) => {
        const v = curveBounds(x, 0, y, 0);
        bounds.left = Math.min(bounds.left, v.left);
        bounds.right = Math.max(bounds.right, v.right);
    };
    for (const x of [ax0, ax1]) {
        for (const y of [bx0, bx1]) include(x, y);
        for (const d of [-100, 100]) if (x + d >= bx0 && x + d <= bx1) include(x, x + d);
    }
    for (const y of [bx0, bx1]) for (const d of [-100, 100]) if (y - d >= ax0 && y - d <= ax1) include(y - d, y);
    return bounds;
}

function anchorRange(node: CanvasNodeData, handle: string | undefined, x: number, y: number): CanvasSpatialBounds | null {
    if (parseBatchCellHandle(handle))
        return {
            left: node.position.x + 4,
            right: node.position.x + Math.max(4, node.width - 8),
            top: node.position.y + BATCH_TABLE_HEADER_HEIGHT + BATCH_COLUMN_HEADER_HEIGHT + 4,
            bottom: node.position.y + Math.max(BATCH_TABLE_HEADER_HEIGHT + BATCH_COLUMN_HEADER_HEIGHT + 4, node.height - 8),
        };
    if (handle?.startsWith("row:"))
        return { left: x, right: x, top: Math.min(y, node.position.y + STORYBOARD_HEADER_HEIGHT + 4), bottom: Math.max(y, node.position.y + STORYBOARD_HEADER_HEIGHT + storyboardTableHeight(node.height, node.metadata?.storyboardComposerHeight) - 4) };
    return null;
}

export function connectionHandleY(node: CanvasNodeData, handleId?: string, scrollTop = 0) {
    const batchY = batchReferenceHandleY(node, handleId);
    if (batchY !== undefined) return batchY;
    if (handleId === "storyboard:context") return node.position.y + node.height - (node.metadata?.storyboardComposerHeight || 104) / 2;
    if (!handleId?.startsWith("row:")) return node.position.y + node.height / 2;
    const index = (node.metadata?.storyboard?.rows || []).findIndex((row) => row.id === handleId.slice(4));
    if (index < 0) return node.position.y + node.height / 2;
    const tableHeight = storyboardTableHeight(node.height, node.metadata?.storyboardComposerHeight);
    return node.position.y + STORYBOARD_HEADER_HEIGHT + Math.min(Math.max(index * STORYBOARD_ROW_HEIGHT + STORYBOARD_ROW_HEIGHT / 2 - scrollTop, 4), tableHeight - 4);
}

export function activeConnectionPath(node: CanvasNodeData | undefined, handle: ConnectionHandle, mouseWorld: Position, nodeScrollTop = 0, nodeBatchScroll?: BatchScroll) {
    if (!node) return "";
    const cell = batchCellAnchor(node, handle.handleId, nodeBatchScroll);
    if (parseBatchCellHandle(handle.handleId) && !cell) return "";
    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? connectionHandleY(node, handle.handleId, nodeScrollTop) : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : (cell?.x ?? node.position.x);
    const endY = handle.handleType === "source" ? mouseWorld.y : (cell?.y ?? connectionHandleY(node, handle.handleId, nodeScrollTop));
    const distance = Math.abs(endX - startX);
    return `M ${startX} ${startY} C ${startX + distance * 0.5} ${startY}, ${endX - distance * 0.5} ${endY}, ${endX} ${endY}`;
}
