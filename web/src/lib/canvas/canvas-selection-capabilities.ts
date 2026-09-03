import { batchSourceRestriction } from "@/lib/canvas/canvas-batch-connection";
import { isFrameNode } from "@/lib/canvas/canvas-frame";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type CanvasSelectionCapabilities = {
    selectedCount: number;
    layoutEligibleCount: number;
    storyboardEligibleCount: number;
    referenceGroupEligibleCount: number;
    batchConnectEligibleCount: number;
};

/**
 * 工具栏与实际执行逻辑共用的选择能力口径。
 * 这里只做资格统计，不改变任何节点或业务规则。
 */
export function getCanvasSelectionCapabilities(nodes: CanvasNodeData[], selectedNodeIds: ReadonlySet<string>): CanvasSelectionCapabilities {
    const selected = nodes.filter((node) => selectedNodeIds.has(node.id));
    return {
        selectedCount: selected.length,
        layoutEligibleCount: selected.filter((node) => !node.metadata?.locked && !isFrameNode(node)).length,
        storyboardEligibleCount: selected.filter((node) => !node.metadata?.locked && node.type === CanvasNodeType.Image && Boolean(node.metadata?.content)).length,
        referenceGroupEligibleCount: selected.filter((node) => !node.metadata?.locked && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && Boolean(node.metadata?.content)).length,
        batchConnectEligibleCount: selected.filter((node) => !batchSourceRestriction(node)).length,
    };
}
