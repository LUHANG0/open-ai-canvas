import { CANVAS_MAX_RENDERED_NODES } from "@/lib/canvas/canvas-render-budget";
import { canvasNodeBounds, type CanvasSpatialBounds, type CanvasSpatialIndex } from "@/lib/canvas/canvas-spatial-index";
import type { CanvasNodeData } from "@/types/canvas";

export const intersectsCanvasBounds = (a: CanvasSpatialBounds, b: CanvasSpatialBounds) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;

/** 预算只能裁减屏外预加载，不能裁掉屏内节点或正在交互的节点。 */
export function selectCanvasVisibleNodes({
    index, nodeById, view, enter, retain, hiddenIds, retainedIds, forcedIds, budget,
}: {
    index: CanvasSpatialIndex<string>;
    nodeById: ReadonlyMap<string, CanvasNodeData>;
    view: CanvasSpatialBounds;
    enter: CanvasSpatialBounds;
    retain: CanvasSpatialBounds;
    hiddenIds: ReadonlySet<string>;
    retainedIds: ReadonlySet<string>;
    forcedIds: ReadonlySet<string>;
    budget: number;
}) {
    // 先做语义过滤再预算；折叠子图和屏外缓冲区不能抢占真正可见节点的名额。
    const ids = new Set([...index.query(retain), ...forcedIds]);
    const visible: CanvasNodeData[] = [];
    const overscan: CanvasNodeData[] = [];
    let retainedOverscanCount = 0;
    for (const id of ids) {
        const node = nodeById.get(id);
        if (!node || hiddenIds.has(id)) continue;
        const bounds = canvasNodeBounds(node);
        if (forcedIds.has(id) || intersectsCanvasBounds(bounds, view)) visible.push(node);
        else if (retainedIds.has(id) || intersectsCanvasBounds(bounds, enter)) {
            overscan.push(node);
            if (retainedIds.has(id)) retainedOverscanCount++;
        }
    }
    // 已挂载节点可沿用上一轮实际数量，但不超过正常上限，且只能保留 retain 内的成员。
    // 新预加载仍受原预算约束，不能补满已经释放的历史高水位。
    let retainedSlots = Math.min(retainedOverscanCount, Math.max(0, Math.max(budget, Math.min(retainedIds.size, CANVAS_MAX_RENDERED_NODES)) - visible.length));
    let preloadSlots = Math.max(0, budget - visible.length - retainedSlots);
    // 优先级只决定成员；输出仍维持原 visible / overscan 两组内的顺序。
    return [...visible, ...overscan.filter((node) => {
        if (retainedIds.has(node.id)) {
            if (retainedSlots <= 0) return false;
            retainedSlots--;
        } else {
            if (preloadSlots <= 0) return false;
            preloadSlots--;
        }
        return true;
    })];
}
