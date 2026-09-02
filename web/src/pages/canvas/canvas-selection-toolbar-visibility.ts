export function canShowCanvasSelectionToolbar(selectionCount: number | null, selectionBoxActive: boolean, nodeDragging: boolean) {
    return selectionCount !== null && selectionCount > 0 && !selectionBoxActive && !nodeDragging;
}
