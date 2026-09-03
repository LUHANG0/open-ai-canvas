import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

type NullableNodeIdSetter = Dispatch<SetStateAction<string | null>>;

export interface CanvasHistoryUiResetters {
    dialog: NullableNodeIdSetter;
    textEditor: NullableNodeIdSetter;
    characterReference: NullableNodeIdSetter;
    drawing: NullableNodeIdSetter;
    info: NullableNodeIdSetter;
    subtitle: NullableNodeIdSetter;
    timeline: NullableNodeIdSetter;
    superResolve: NullableNodeIdSetter;
    preview: NullableNodeIdSetter;
    scriptEditor: NullableNodeIdSetter;
    portraitClearance: NullableNodeIdSetter;
    director: NullableNodeIdSetter;
    versionCompare: NullableNodeIdSetter;
    frameDialog: NullableNodeIdSetter;
    segmentDialog: NullableNodeIdSetter;
    crop: NullableNodeIdSetter;
    maskEdit: NullableNodeIdSetter;
    annotation: NullableNodeIdSetter;
    split: NullableNodeIdSetter;
    upscale: NullableNodeIdSetter;
    angle: NullableNodeIdSetter;
    emotion: NullableNodeIdSetter;
}

export function resetCanvasHistoryUi(resetNodeHoverToolbar: () => void, resetters: CanvasHistoryUiResetters) {
    resetNodeHoverToolbar();
    Object.values(resetters).forEach((setNodeId) => setNodeId(null));
}

interface UseCanvasHistoryUiCleanupOptions {
    historyRestoreUiRef: { current: () => void };
    resetNodeHoverToolbar: () => void;
    resetters: CanvasHistoryUiResetters;
}

export function useCanvasHistoryUiCleanup({ historyRestoreUiRef, resetNodeHoverToolbar, resetters }: UseCanvasHistoryUiCleanupOptions) {
    const resettersRef = useRef(resetters);
    resettersRef.current = resetters;

    useEffect(() => {
        historyRestoreUiRef.current = () => resetCanvasHistoryUi(resetNodeHoverToolbar, resettersRef.current);
        return () => {
            historyRestoreUiRef.current = () => undefined;
        };
    }, [historyRestoreUiRef, resetNodeHoverToolbar]);
}
