export function canShowCanvasWorkspaceChrome(focusMode: boolean) {
    return !focusMode;
}

export function canvasWorkspaceModeSwitchRightInset(assistantOpen: boolean, assistantWidth: number) {
    return assistantOpen ? assistantWidth + 24 : "var(--canvas-inset-x)";
}
