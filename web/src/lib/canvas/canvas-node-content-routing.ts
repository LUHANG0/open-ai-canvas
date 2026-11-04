import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

/** Content owned by the project, rather than the built-in node renderer.
 * Keep callbacks attached while LOD is reduced: local hover/editing can reveal
 * the full content without another world-layer render.
 */
export function canvasNodeUsesProjectContent(node: CanvasNodeData, isEditingContent = false): boolean {
    if (node.metadata?.fileUpload) return false;
    return (
        node.type === CanvasNodeType.Config ||
        node.type === CanvasNodeType.Script ||
        node.type === CanvasNodeType.BatchTable ||
        Boolean(node.metadata?.previsSceneId) ||
        (node.metadata?.workflowKind === "character" && Boolean(node.metadata.characterAssetId)) ||
        (node.metadata?.workflowKind === "story_input" && !isEditingContent) ||
        (node.metadata?.workflowKind === "styleboard" && !node.metadata.content)
    );
}
