export type CanvasEmptyStateKind = "freeform" | "linked-project" | "short-drama" | null;

export type CanvasEmptyStateChapter = {
    id: string;
    title: string;
    position: number;
};

export function resolveCanvasEmptyStateKind(nodeCount: number, shortDramaEnabled: boolean, linkedProjectId?: string | null): CanvasEmptyStateKind {
    if (nodeCount > 0) return null;
    if (!shortDramaEnabled) return "freeform";
    return linkedProjectId ? "linked-project" : "short-drama";
}

export function firstCanvasProjectChapter(chapters?: readonly CanvasEmptyStateChapter[]) {
    return chapters?.slice().sort((left, right) => left.position - right.position)[0] ?? null;
}
