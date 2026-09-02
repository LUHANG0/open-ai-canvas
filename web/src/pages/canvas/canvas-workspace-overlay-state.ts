export function canvasActiveTaskPanelInsets(focusMode: boolean, assistantOpen: boolean, assistantWidth: number) {
    return {
        topInset: focusMode ? "var(--space-3)" : "var(--canvas-topbar-offset)",
        rightInset: assistantOpen ? assistantWidth + 12 : "var(--space-3)",
    };
}
