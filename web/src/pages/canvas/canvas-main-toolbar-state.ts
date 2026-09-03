export function canShowCanvasMainToolbar(focusMode: boolean, focusDockRevealed: boolean) {
    return !focusMode || focusDockRevealed;
}

export function canvasMainToolbarRightInset(assistantOpen: boolean, assistantWidth: number) {
    return assistantOpen ? assistantWidth + 16 : "var(--canvas-inset-x)";
}
