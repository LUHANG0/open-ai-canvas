export function focusCanvasVersionFromCompare(nodeId: string, onClose: () => void, onFocus: (nodeId: string) => void) {
    onClose();
    onFocus(nodeId);
}

export function resolveCanvasProjectFolderInsertHandler<T extends (folderId: string) => unknown>(scope: string, onInsertFolder: T): T | undefined {
    return scope === "canvas" ? onInsertFolder : undefined;
}
