import { useCallback, useEffect, useState } from "react";

// Selection may survive dragging; editing controls require an explicit activation.
export function useCanvasNodeControls() {
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    useEffect(() => {
        // Creation and keyboard commands already open the appropriate editor.
        if (dialogNodeId) setToolbarNodeId(dialogNodeId);
    }, [dialogNodeId]);
    const closeNodeControls = useCallback(() => {
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, []);
    return { toolbarNodeId, setToolbarNodeId, dialogNodeId, setDialogNodeId, closeNodeControls };
}
