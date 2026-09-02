export function activeCanvasAssetTrayNodeId(selectedNodeIds: ReadonlySet<string>) {
    return selectedNodeIds.size === 1 ? selectedNodeIds.values().next().value || null : null;
}

export function canShowCanvasMiniMap(isMiniMapOpen: boolean, focusMode: boolean) {
    return isMiniMapOpen && !focusMode;
}
