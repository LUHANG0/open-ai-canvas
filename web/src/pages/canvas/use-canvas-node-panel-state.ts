import { useState } from "react";

export function useCanvasNodePanelState() {
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [textEditorNodeId, setTextEditorNodeId] = useState<string | null>(null);
    const [characterReferenceNodeId, setCharacterReferenceNodeId] = useState<string | null>(null);
    const [drawingNodeId, setDrawingNodeId] = useState<string | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [subtitleNodeId, setSubtitleNodeId] = useState<string | null>(null);
    const [timelineNodeId, setTimelineNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [scriptEditorNodeId, setScriptEditorNodeId] = useState<string | null>(null);
    const [portraitClearanceNodeId, setPortraitClearanceNodeId] = useState<string | null>(null);
    const [scriptScrollTopById, setScriptScrollTopById] = useState<Record<string, number>>({});
    const [directorNodeId, setDirectorNodeId] = useState<string | null>(null);
    const [versionCompareRootId, setVersionCompareRootId] = useState<string | null>(null);

    return {
        characterReferenceNodeId,
        dialogNodeId,
        directorNodeId,
        drawingNodeId,
        infoNodeId,
        portraitClearanceNodeId,
        previewNodeId,
        scriptEditorNodeId,
        scriptScrollTopById,
        setCharacterReferenceNodeId,
        setDialogNodeId,
        setDirectorNodeId,
        setDrawingNodeId,
        setInfoNodeId,
        setPortraitClearanceNodeId,
        setPreviewNodeId,
        setScriptEditorNodeId,
        setScriptScrollTopById,
        setSubtitleNodeId,
        setSuperResolveNodeId,
        setTextEditorNodeId,
        setTimelineNodeId,
        setToolbarNodeId,
        setVersionCompareRootId,
        subtitleNodeId,
        superResolveNodeId,
        textEditorNodeId,
        timelineNodeId,
        toolbarNodeId,
        versionCompareRootId,
    };
}
