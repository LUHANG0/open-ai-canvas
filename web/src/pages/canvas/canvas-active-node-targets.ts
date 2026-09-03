import type { PendingConnectionCreate } from "@/components/canvas/canvas-workspace-overlays";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

function nodeFromId(nodeById: ReadonlyMap<string, CanvasNodeData>, nodeId: string | null) {
    return nodeId ? nodeById.get(nodeId) || null : null;
}

interface ResolveCanvasActiveNodeTargetsOptions {
    nodeById: ReadonlyMap<string, CanvasNodeData>;
    dialogNodeId: string | null;
    subtitleNodeId: string | null;
    timelineNodeId: string | null;
    frameDialogNodeId: string | null;
    segmentDialogNodeId: string | null;
    textEditorNodeId: string | null;
    characterReferenceNodeId: string | null;
    drawingNodeId: string | null;
    pendingConnectionCreate: PendingConnectionCreate | null;
}

export function resolveCanvasActiveNodeTargets({
    nodeById,
    dialogNodeId,
    subtitleNodeId,
    timelineNodeId,
    frameDialogNodeId,
    segmentDialogNodeId,
    textEditorNodeId,
    characterReferenceNodeId,
    drawingNodeId,
    pendingConnectionCreate,
}: ResolveCanvasActiveNodeTargetsOptions) {
    const pendingConnectionSourceNode = pendingConnectionCreate?.connection.handleType === "source" ? nodeById.get(pendingConnectionCreate.connection.nodeId) || null : null;
    return {
        dialogNode: nodeFromId(nodeById, dialogNodeId),
        subtitleNode: nodeFromId(nodeById, subtitleNodeId),
        timelineNode: nodeFromId(nodeById, timelineNodeId),
        frameNode: nodeFromId(nodeById, frameDialogNodeId),
        segmentNode: nodeFromId(nodeById, segmentDialogNodeId),
        textEditorNode: nodeFromId(nodeById, textEditorNodeId),
        characterReferenceNode: nodeFromId(nodeById, characterReferenceNodeId),
        drawingNode: nodeFromId(nodeById, drawingNodeId),
        canCreateDrawingFromConnection:
            !pendingConnectionCreate?.batchSourceNodeIds?.length && pendingConnectionSourceNode?.type === CanvasNodeType.Image && Boolean(pendingConnectionSourceNode.metadata?.content),
    };
}
