import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

export const CANVAS_NODE_TOOLBAR_HIDE_DELAY_MS = 120;

export function canRevealCanvasNodeToolbar(nodeDragging: boolean, imageSettingsOpen: boolean) {
    return !nodeDragging && !imageSettingsOpen;
}

type UseCanvasNodeHoverToolbarOptions = {
    dialogNodeId: string | null;
    nodeDraggingRef: MutableRefObject<boolean>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
};

export function useCanvasNodeHoverToolbar({ dialogNodeId, nodeDraggingRef, setHoveredNodeId, setToolbarNodeId }: UseCanvasNodeHoverToolbarOptions) {
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);

    const clearPendingToolbarHide = useCallback(() => {
        if (!toolbarHideTimerRef.current) return;
        clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = null;
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (!canRevealCanvasNodeToolbar(nodeDraggingRef.current, nodeImageSettingsOpen)) return;
            clearPendingToolbarHide();
            setToolbarNodeId(nodeId);
        },
        [clearPendingToolbarHide, nodeDraggingRef, nodeImageSettingsOpen, setToolbarNodeId],
    );

    const hideNodeToolbar = useCallback(() => {
        clearPendingToolbarHide();
        toolbarHideTimerRef.current = setTimeout(() => {
            setToolbarNodeId(null);
            toolbarHideTimerRef.current = null;
        }, CANVAS_NODE_TOOLBAR_HIDE_DELAY_MS);
    }, [clearPendingToolbarHide, setToolbarNodeId]);

    const handleCanvasNodeHoverStart = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current) return;
            setHoveredNodeId(nodeId);
            keepNodeToolbar(nodeId);
        },
        [keepNodeToolbar, nodeDraggingRef, setHoveredNodeId],
    );

    const handleCanvasNodeHoverEnd = useCallback(
        (nodeId: string) => {
            setHoveredNodeId((current) => (current === nodeId ? null : current));
            hideNodeToolbar();
        },
        [hideNodeToolbar, setHoveredNodeId],
    );

    const handleNodeImageSettingsOpenChange = useCallback(
        (open: boolean) => {
            setNodeImageSettingsOpen(open);
            if (!open) return;
            clearPendingToolbarHide();
            setToolbarNodeId(null);
        },
        [clearPendingToolbarHide, setToolbarNodeId],
    );

    const resetNodeHoverToolbar = useCallback(() => {
        clearPendingToolbarHide();
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setNodeImageSettingsOpen(false);
    }, [clearPendingToolbarHide, setHoveredNodeId, setToolbarNodeId]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => clearPendingToolbarHide, [clearPendingToolbarHide]);

    return {
        handleCanvasNodeHoverEnd,
        handleCanvasNodeHoverStart,
        handleNodeImageSettingsOpenChange,
        hideNodeToolbar,
        keepNodeToolbar,
        nodeImageSettingsOpen,
        resetNodeHoverToolbar,
    };
}
