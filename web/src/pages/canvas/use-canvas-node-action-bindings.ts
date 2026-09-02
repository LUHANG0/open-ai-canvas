import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";

import type { CanvasNodeActionContextValue } from "@/components/canvas/canvas-node-action-context";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export function mergeCanvasNodeMetadata(nodes: CanvasNodeData[], nodeId: string, patch: CanvasNodeMetadata) {
    return nodes.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node));
}

export function resizeCanvasNode(nodes: CanvasNodeData[], nodeId: string, size: { width: number; height: number }) {
    return nodes.map((node) => (node.id === nodeId ? { ...node, width: size.width, height: size.height } : node));
}

type UseCanvasNodeActionBindingsOptions = {
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setVersionCompareRootId: Dispatch<SetStateAction<string | null>>;
    setPreviewNodeId: Dispatch<SetStateAction<string | null>>;
    openDirectorWorkbench: (nodeId: string) => void;
    duplicateNode: (nodeId: string) => void;
    deleteNodes: (nodeIds: Set<string>) => void;
    downloadNodeImage: (node: CanvasNodeData) => void;
    openPortraitClearance: (node: CanvasNodeData) => void;
    selectVideoForPlayback: (nodeId: string) => void;
};

export function useCanvasNodeActionBindings({
    setNodes,
    setVersionCompareRootId,
    setPreviewNodeId,
    openDirectorWorkbench,
    duplicateNode,
    deleteNodes,
    downloadNodeImage,
    openPortraitClearance,
    selectVideoForPlayback,
}: UseCanvasNodeActionBindingsOptions) {
    const openCanvasNodeVersions = useCallback((node: CanvasNodeData) => setVersionCompareRootId(node.metadata?.versionOfNodeId || node.id), [setVersionCompareRootId]);
    const viewCanvasNodeImage = useCallback((node: CanvasNodeData) => setPreviewNodeId(node.id), [setPreviewNodeId]);
    const editCanvasDirector = useCallback((node: CanvasNodeData) => openDirectorWorkbench(node.id), [openDirectorWorkbench]);
    const updateCanvasNodeMetadata = useCallback((nodeId: string, patch: CanvasNodeMetadata) => setNodes((current) => mergeCanvasNodeMetadata(current, nodeId, patch)), [setNodes]);
    const resizeCanvasNodeFromContent = useCallback((nodeId: string, size: { width: number; height: number }) => setNodes((current) => resizeCanvasNode(current, nodeId, size)), [setNodes]);
    const duplicateCanvasNodeFromContext = useCallback((node: CanvasNodeData) => duplicateNode(node.id), [duplicateNode]);
    const deleteCanvasNodeFromContext = useCallback((node: CanvasNodeData) => deleteNodes(new Set([node.id])), [deleteNodes]);

    const canvasNodeActions = useMemo<CanvasNodeActionContextValue>(
        () => ({
            download: downloadNodeImage,
            duplicate: duplicateCanvasNodeFromContext,
            deleteNode: deleteCanvasNodeFromContext,
            updateMetadata: updateCanvasNodeMetadata,
            resizeNode: resizeCanvasNodeFromContent,
            openPortraitClearance,
            selectVideoForPlayback,
        }),
        [deleteCanvasNodeFromContext, downloadNodeImage, duplicateCanvasNodeFromContext, openPortraitClearance, resizeCanvasNodeFromContent, selectVideoForPlayback, updateCanvasNodeMetadata],
    );

    return { canvasNodeActions, editCanvasDirector, openCanvasNodeVersions, viewCanvasNodeImage };
}
