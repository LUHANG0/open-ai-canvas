import type { CanvasNodeData } from "@/types/canvas";

export function resolveCanvasProjectToolbarNode(node: CanvasNodeData | null, blocked: boolean) {
    return blocked ? null : node;
}

export function canvasNodeInfoUsesTextEditor(node: CanvasNodeData) {
    return node.metadata?.workflowKind === "character" && Boolean(node.metadata.characterAssetId);
}

export function nextCanvasNodeFontSize(current: number | undefined, delta: -2 | 2) {
    return Math.min(32, Math.max(10, (current || 14) + delta));
}
