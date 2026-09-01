import type { CanvasNodeData, Position } from "@/types/canvas";

type NodeFootprint = Pick<CanvasNodeData, "position" | "width" | "height">;

export const CANVAS_INSERT_GAP = 36;
export const CANVAS_BATCH_GAP = 24;

function overlapsWithGap(a: NodeFootprint, b: NodeFootprint, gap: number) {
    return a.position.x < b.position.x + b.width + gap
        && a.position.x + a.width + gap > b.position.x
        && a.position.y < b.position.y + b.height + gap
        && a.position.y + a.height + gap > b.position.y;
}

function candidateOffsets(width: number, height: number, gap: number, ring: number): Position[] {
    const dx = (width + gap) * ring;
    const dy = (height + gap) * ring;
    return [
        { x: dx, y: 0 },
        { x: 0, y: dy },
        { x: -dx, y: 0 },
        { x: 0, y: -dy },
        { x: dx, y: dy },
        { x: -dx, y: dy },
        { x: dx, y: -dy },
        { x: -dx, y: -dy },
    ];
}

/**
 * 将以中心点表达的插入意图转换为不遮挡现有节点的左上角坐标。
 * 优先保留用户指定位置；发生冲突时按由近到远的环形候选位寻找空位。
 */
export function findAvailableNodePosition(
    existingNodes: readonly NodeFootprint[],
    size: { width: number; height: number },
    preferredCenter: Position,
    gap = CANVAS_INSERT_GAP,
) {
    const origin = {
        x: preferredCenter.x - size.width / 2,
        y: preferredCenter.y - size.height / 2,
    };
    const isAvailable = (position: Position) => !existingNodes.some((node) => overlapsWithGap({ position, ...size }, node, gap));
    if (isAvailable(origin)) return origin;

    for (let ring = 1; ring <= 12; ring += 1) {
        for (const offset of candidateOffsets(size.width, size.height, gap, ring)) {
            const candidate = { x: origin.x + offset.x, y: origin.y + offset.y };
            if (isAvailable(candidate)) return candidate;
        }
    }

    return {
        x: origin.x + (size.width + gap) * 13,
        y: origin.y,
    };
}

export function placeCanvasNode(
    node: CanvasNodeData,
    existingNodes: readonly NodeFootprint[],
    preferredCenter: Position,
) {
    return {
        ...node,
        position: findAvailableNodePosition(existingNodes, node, preferredCenter),
    };
}

/**
 * 批量素材先按各自真实尺寸紧凑排版，再把整个组合视为一个矩形避让已有节点。
 * 这样既不会相互覆盖，也不会因每个节点分别避让而产生指数级空隙。
 */
export function layoutCompactNodeGroup(
    nodes: readonly CanvasNodeData[],
    existingNodes: readonly NodeFootprint[],
    preferredCenter: Position,
    maxColumns = 3,
    gap = CANVAS_BATCH_GAP,
) {
    if (!nodes.length) return [];
    const columns = Math.max(1, Math.min(maxColumns, nodes.length));
    const rows = Math.ceil(nodes.length / columns);
    const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(...nodes.filter((_, index) => index % columns === column).map((node) => node.width)));
    const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...nodes.slice(row * columns, (row + 1) * columns).map((node) => node.height)));
    const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + gap * (columns - 1);
    const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gap * (rows - 1);
    const groupPosition = findAvailableNodePosition(existingNodes, { width: totalWidth, height: totalHeight }, preferredCenter, gap);
    const columnOffsets = columnWidths.map((_, column) => columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0) + gap * column);
    const rowOffsets = rowHeights.map((_, row) => rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) + gap * row);

    return nodes.map((node, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return {
            ...node,
            position: {
                x: groupPosition.x + columnOffsets[column] + (columnWidths[column] - node.width) / 2,
                y: groupPosition.y + rowOffsets[row] + (rowHeights[row] - node.height) / 2,
            },
        };
    });
}
