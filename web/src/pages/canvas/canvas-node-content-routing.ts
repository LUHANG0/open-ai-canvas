import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type CanvasNodeContentKind = "character" | "style-placeholder" | "story-input" | "script" | "director" | "config";

export function canvasNodeContentKind(node: CanvasNodeData): CanvasNodeContentKind {
    if (node.metadata?.workflowKind === "character" && node.metadata.characterAssetId) return "character";
    if (node.metadata?.workflowKind === "styleboard" && !node.metadata.content) return "style-placeholder";
    if (node.metadata?.workflowKind === "story_input") return "story-input";
    if (node.type === CanvasNodeType.Script) return "script";
    if (node.metadata?.directorSceneId) return "director";
    return "config";
}
