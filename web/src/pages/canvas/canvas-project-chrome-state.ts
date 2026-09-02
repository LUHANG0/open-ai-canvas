export function canShowCanvasProjectTopBar(focusMode: boolean) {
    return !focusMode;
}

export function canShowCanvasProjectSidebar(focusMode: boolean, shortDramaEnabled: boolean, projectId?: string | null) {
    return !focusMode && shortDramaEnabled && Boolean(projectId);
}

export function buildCanvasProjectTopBarContext<T extends object>(
    context: T,
    shortDramaEnabled: boolean,
    projectId: string | null | undefined,
    projectName: string,
) {
    if (!shortDramaEnabled || !projectId) return undefined;
    return { ...context, projectId, projectName };
}
