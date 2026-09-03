import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { PORTRAIT_CLEARANCE_NODE_TYPE } from "@/lib/portrait-clearance/contracts";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeTypeId, type ContextMenuState } from "@/types/canvas";

type NodeClickTarget = {
    dialogNodeId: string | null;
    drawingNodeId?: string;
    portraitClearanceNodeId?: string;
};

export function resolveCanvasNodeClickTarget(node: CanvasNodeData, currentDialogNodeId: string | null, currentDialogNodeType?: CanvasNodeTypeId): NodeClickTarget {
    if (node.type === CanvasNodeType.Drawing) return { dialogNodeId: null, drawingNodeId: node.id };
    if (node.type === CanvasNodeType.Script) return { dialogNodeId: null };
    if (node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Frame) return { dialogNodeId: currentDialogNodeId === node.id ? currentDialogNodeId : null };
    if (node.type === PORTRAIT_CLEARANCE_NODE_TYPE) return { dialogNodeId: null, portraitClearanceNodeId: node.id };
    // 选择参考媒体时保留当前生成配置，避免用户正在配置的工作流被媒体选择替换。
    return { dialogNodeId: currentDialogNodeType === CanvasNodeType.Config ? currentDialogNodeId : node.id };
}

export function applyCanvasBlankClick(deselectCanvas: () => void, closeAgent: () => void) {
    deselectCanvas();
    closeAgent();
}

type UseCanvasNodeFocusOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    dialogNodeId: string | null;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setTextEditorNodeId: Dispatch<SetStateAction<string | null>>;
    setCharacterReferenceNodeId: Dispatch<SetStateAction<string | null>>;
    setDrawingNodeId: Dispatch<SetStateAction<string | null>>;
    setPortraitClearanceNodeId: Dispatch<SetStateAction<string | null>>;
};

export function useCanvasNodeFocus({
    nodesRef,
    selectedNodeIdsRef,
    dialogNodeId,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    setHoveredNodeId,
    setToolbarNodeId,
    setDialogNodeId,
    setTextEditorNodeId,
    setCharacterReferenceNodeId,
    setDrawingNodeId,
    setPortraitClearanceNodeId,
}: UseCanvasNodeFocusOptions) {
    const clearTransientChrome = useCallback(() => {
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
    }, [setContextMenu, setHoveredNodeId, setToolbarNodeId]);

    const selectExclusiveNode = useCallback(
        (nodeId: string) => {
            setSelectedNodeIds(new Set([nodeId]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(null);
            setToolbarNodeId(null);
        },
        [setContextMenu, setDialogNodeId, setSelectedConnectionId, setSelectedNodeIds, setToolbarNodeId],
    );

    const handleCanvasSelectionStart = useCallback(() => setContextMenu(null), [setContextMenu]);

    const handleNodeInteractionStart = useCallback(
        (selectionModifier: boolean) => {
            clearTransientChrome();
            if (selectionModifier) setDialogNodeId(null);
        },
        [clearTransientChrome, setDialogNodeId],
    );

    const handleSelectedNodeClick = useCallback(
        (node: CanvasNodeData) => {
            const currentDialogNodeType = dialogNodeId ? nodesRef.current.find((item) => item.id === dialogNodeId)?.type : undefined;
            const target = resolveCanvasNodeClickTarget(node, dialogNodeId, currentDialogNodeType);
            setDialogNodeId(target.dialogNodeId);
            if (target.drawingNodeId) setDrawingNodeId(target.drawingNodeId);
            if (target.portraitClearanceNodeId) setPortraitClearanceNodeId(target.portraitClearanceNodeId);
        },
        [dialogNodeId, nodesRef, setDialogNodeId, setDrawingNodeId, setPortraitClearanceNodeId],
    );

    const handleCanvasDeselect = useCallback(() => {
        clearTransientChrome();
        setDialogNodeId(null);
    }, [clearTransientChrome, setDialogNodeId]);

    const openTextNodeEditor = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Text) return;
            selectExclusiveNode(node.id);
            if (node.metadata?.workflowKind === "character" && node.metadata.characterAssetId) {
                setCharacterReferenceNodeId(node.id);
                return;
            }
            setTextEditorNodeId(node.id);
        },
        [selectExclusiveNode, setCharacterReferenceNodeId, setTextEditorNodeId],
    );

    const openDrawingNode = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Drawing) return;
            selectExclusiveNode(node.id);
            setDrawingNodeId(node.id);
        },
        [selectExclusiveNode, setDrawingNodeId],
    );

    const openPortraitClearance = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== PORTRAIT_CLEARANCE_NODE_TYPE) return;
            selectExclusiveNode(node.id);
            setPortraitClearanceNodeId(node.id);
        },
        [selectExclusiveNode, setPortraitClearanceNodeId],
    );

    const selectVideoForPlayback = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId && item.type === CanvasNodeType.Video);
            if (!node) return;
            const selection = new Set([nodeId]);
            selectedNodeIdsRef.current = selection;
            setSelectedNodeIds(selection);
            setSelectedConnectionId(null);
            handleNodeInteractionStart(false);
            handleSelectedNodeClick(node);
        },
        [handleNodeInteractionStart, handleSelectedNodeClick, nodesRef, selectedNodeIdsRef, setSelectedConnectionId, setSelectedNodeIds],
    );

    return {
        handleCanvasDeselect,
        handleCanvasSelectionStart,
        handleNodeInteractionStart,
        handleSelectedNodeClick,
        openDrawingNode,
        openPortraitClearance,
        openTextNodeEditor,
        selectVideoForPlayback,
    };
}
