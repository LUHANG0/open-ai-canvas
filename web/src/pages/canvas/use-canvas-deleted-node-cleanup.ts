import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CanvasAssistantSession, CanvasNodeData, ContextMenuState } from "@/types/canvas";

type NullableNodeIdSetter = Dispatch<SetStateAction<string | null>>;

export function clearDeletedNodeId(current: string | null, removedIds: ReadonlySet<string>) {
    return current && removedIds.has(current) ? null : current;
}

export function filterDeletedNodeScrollOffsets(current: Record<string, number>, removedIds: ReadonlySet<string>) {
    return Object.fromEntries(Object.entries(current).filter(([id]) => !removedIds.has(id)));
}

export function closeDeletedNodeContextMenu(current: ContextMenuState | null, removedIds: ReadonlySet<string>) {
    return current?.type === "node" && removedIds.has(current.nodeId) ? null : current;
}

interface UseCanvasDeletedNodeCleanupOptions {
    projectId: string;
    chatSessions: CanvasAssistantSession[];
    cleanupCanvasFiles: (extra?: unknown) => void;
    setHoveredNodeId: NullableNodeIdSetter;
    setToolbarNodeId: NullableNodeIdSetter;
    setDialogNodeId: NullableNodeIdSetter;
    setTextEditorNodeId: NullableNodeIdSetter;
    setCharacterReferenceNodeId: NullableNodeIdSetter;
    setDrawingNodeId: NullableNodeIdSetter;
    setInfoNodeId: NullableNodeIdSetter;
    setSubtitleNodeId: NullableNodeIdSetter;
    setFrameDialogNodeId: NullableNodeIdSetter;
    setSegmentDialogNodeId: NullableNodeIdSetter;
    setCropNodeId: NullableNodeIdSetter;
    setMaskEditNodeId: NullableNodeIdSetter;
    setAnnotationNodeId: NullableNodeIdSetter;
    setSplitNodeId: NullableNodeIdSetter;
    setUpscaleNodeId: NullableNodeIdSetter;
    setAngleNodeId: NullableNodeIdSetter;
    setEmotionNodeId: NullableNodeIdSetter;
    setSuperResolveNodeId: NullableNodeIdSetter;
    setPreviewNodeId: NullableNodeIdSetter;
    setRunningNodeId: NullableNodeIdSetter;
    setScriptEditorNodeId: NullableNodeIdSetter;
    setPortraitClearanceNodeId: NullableNodeIdSetter;
    setDirectorNodeId: NullableNodeIdSetter;
    setVersionCompareRootId: NullableNodeIdSetter;
    setScriptScrollTopById: Dispatch<SetStateAction<Record<string, number>>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
}

export function useCanvasDeletedNodeCleanup({
    projectId,
    chatSessions,
    cleanupCanvasFiles,
    setHoveredNodeId,
    setToolbarNodeId,
    setDialogNodeId,
    setTextEditorNodeId,
    setCharacterReferenceNodeId,
    setDrawingNodeId,
    setInfoNodeId,
    setSubtitleNodeId,
    setFrameDialogNodeId,
    setSegmentDialogNodeId,
    setCropNodeId,
    setMaskEditNodeId,
    setAnnotationNodeId,
    setSplitNodeId,
    setUpscaleNodeId,
    setAngleNodeId,
    setEmotionNodeId,
    setSuperResolveNodeId,
    setPreviewNodeId,
    setRunningNodeId,
    setScriptEditorNodeId,
    setPortraitClearanceNodeId,
    setDirectorNodeId,
    setVersionCompareRootId,
    setScriptScrollTopById,
    setContextMenu,
}: UseCanvasDeletedNodeCleanupOptions) {
    return useCallback(
        (removedIds: Set<string>, nextNodes: CanvasNodeData[], _removedNodes: CanvasNodeData[]) => {
            const clearNodeId = (setNodeId: NullableNodeIdSetter) => setNodeId((current) => clearDeletedNodeId(current, removedIds));

            [
                setHoveredNodeId,
                setToolbarNodeId,
                setDialogNodeId,
                setTextEditorNodeId,
                setCharacterReferenceNodeId,
                setDrawingNodeId,
                setInfoNodeId,
                setSubtitleNodeId,
                setFrameDialogNodeId,
                setSegmentDialogNodeId,
                setCropNodeId,
                setMaskEditNodeId,
                setAnnotationNodeId,
                setSplitNodeId,
                setUpscaleNodeId,
                setAngleNodeId,
                setEmotionNodeId,
                setSuperResolveNodeId,
                setPreviewNodeId,
                setRunningNodeId,
                setScriptEditorNodeId,
                setPortraitClearanceNodeId,
                setDirectorNodeId,
                setVersionCompareRootId,
            ].forEach(clearNodeId);

            setScriptScrollTopById((current) => filterDeletedNodeScrollOffsets(current, removedIds));
            setContextMenu((current) => closeDeletedNodeContextMenu(current, removedIds));
            // 绘图文档随项目保留：节点删除可撤销，恢复后仍能读取原内容。
            cleanupCanvasFiles({ projectId, nodes: nextNodes, chatSessions });
        },
        [
            chatSessions,
            cleanupCanvasFiles,
            projectId,
            setAngleNodeId,
            setAnnotationNodeId,
            setCharacterReferenceNodeId,
            setContextMenu,
            setCropNodeId,
            setDialogNodeId,
            setDirectorNodeId,
            setDrawingNodeId,
            setEmotionNodeId,
            setFrameDialogNodeId,
            setHoveredNodeId,
            setInfoNodeId,
            setMaskEditNodeId,
            setPortraitClearanceNodeId,
            setPreviewNodeId,
            setRunningNodeId,
            setScriptEditorNodeId,
            setScriptScrollTopById,
            setSegmentDialogNodeId,
            setSplitNodeId,
            setSubtitleNodeId,
            setSuperResolveNodeId,
            setTextEditorNodeId,
            setToolbarNodeId,
            setUpscaleNodeId,
            setVersionCompareRootId,
        ],
    );
}
