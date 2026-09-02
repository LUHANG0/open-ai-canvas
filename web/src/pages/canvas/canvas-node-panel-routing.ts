import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type CanvasNodePanelKind = "config" | "prompt" | null;

export function canvasNodePanelKind(node: CanvasNodeData): CanvasNodePanelKind {
    if (node.type === CanvasNodeType.Script || node.type === CanvasNodeType.Drawing) return null;
    return node.type === CanvasNodeType.Config ? "config" : "prompt";
}
