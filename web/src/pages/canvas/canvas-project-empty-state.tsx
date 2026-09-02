import { CanvasFreeformEmptyState, CanvasLinkedProjectEmptyState, CanvasShortDramaEmptyState } from "@/components/canvas/canvas-short-drama-entry";
import { CanvasNodeType } from "@/types/canvas";
import { firstCanvasProjectChapter, resolveCanvasEmptyStateKind, type CanvasEmptyStateChapter } from "./canvas-empty-state-routing";

type ProjectChapterInsert = CanvasEmptyStateChapter & { projectId: string };

type CanvasProjectEmptyStateOptions = {
    nodeCount: number;
    shortDramaEnabled: boolean;
    linkedProjectId?: string | null;
    projectTitle: string;
    linkedProjectName?: string | null;
    chapters?: readonly CanvasEmptyStateChapter[];
    onUpload: () => void;
    onAddText: () => void;
    onAddScript: () => void;
    onCreatePipeline: () => void;
    onOpenAgent: () => void;
    onOpenAssets: () => void;
    onInsertProjectChapter: (chapter: ProjectChapterInsert) => void | Promise<void>;
};

export function activateCanvasEmptyStateAgent(setCinematicAgentEntry: (active: boolean) => void, setAgentMode: (mode: "online") => void, openAgent: (mode: "online") => void) {
    setCinematicAgentEntry(true);
    setAgentMode("online");
    openAgent("online");
}

type CanvasProjectEmptyStateEntryOptions = Omit<CanvasProjectEmptyStateOptions, "onUpload" | "onAddText" | "onAddScript" | "onOpenAgent"> & {
    onUploadRequest: () => void;
    onCreateNode: (type: CanvasNodeType) => void;
    setCinematicAgentEntry: (active: boolean) => void;
    setAgentMode: (mode: "online") => void;
    openAgent: (mode: "online") => void;
};

export function renderCanvasProjectEmptyStateEntry({ onUploadRequest, onCreateNode, setCinematicAgentEntry, setAgentMode, openAgent, ...options }: CanvasProjectEmptyStateEntryOptions) {
    return renderCanvasProjectEmptyState({
        ...options,
        onUpload: onUploadRequest,
        onAddText: () => onCreateNode(CanvasNodeType.Text),
        onAddScript: () => onCreateNode(CanvasNodeType.Script),
        onOpenAgent: () => activateCanvasEmptyStateAgent(setCinematicAgentEntry, setAgentMode, openAgent),
    });
}

export function renderCanvasProjectEmptyState({
    nodeCount,
    shortDramaEnabled,
    linkedProjectId,
    projectTitle,
    linkedProjectName,
    chapters,
    onUpload,
    onAddText,
    onAddScript,
    onCreatePipeline,
    onOpenAgent,
    onOpenAssets,
    onInsertProjectChapter,
}: CanvasProjectEmptyStateOptions) {
    const kind = resolveCanvasEmptyStateKind(nodeCount, shortDramaEnabled, linkedProjectId);
    if (kind === "freeform") return <CanvasFreeformEmptyState onUpload={onUpload} onAddText={onAddText} />;
    if (kind === "short-drama") {
        return <CanvasShortDramaEmptyState onCreatePipeline={onCreatePipeline} onOpenAgent={onOpenAgent} onUpload={onUpload} onAddText={onAddText} onAddScript={onAddScript} />;
    }
    if (kind !== "linked-project" || !linkedProjectId) return null;

    const firstChapter = firstCanvasProjectChapter(chapters);
    return (
        <CanvasLinkedProjectEmptyState
            projectName={linkedProjectName || projectTitle}
            hasChapter={Boolean(firstChapter)}
            onAddFirstChapter={() => {
                if (firstChapter) void onInsertProjectChapter({ ...firstChapter, projectId: linkedProjectId });
            }}
            onOpenAssets={onOpenAssets}
            onAddText={onAddText}
        />
    );
}
