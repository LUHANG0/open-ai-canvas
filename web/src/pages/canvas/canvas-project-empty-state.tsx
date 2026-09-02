import { lazy, Suspense } from "react";

import { CanvasNodeType } from "@/types/canvas";
import { firstCanvasProjectChapter, resolveCanvasEmptyStateKind, type CanvasEmptyStateChapter } from "./canvas-empty-state-routing";

const CanvasFreeformEmptyState = lazy(() => import("@/components/canvas/canvas-empty-states").then((module) => ({ default: module.CanvasFreeformEmptyState })));
const CanvasLinkedProjectEmptyState = lazy(() => import("@/components/canvas/canvas-empty-states").then((module) => ({ default: module.CanvasLinkedProjectEmptyState })));
const CanvasShortDramaEmptyState = lazy(() => import("@/components/canvas/canvas-empty-states").then((module) => ({ default: module.CanvasShortDramaEmptyState })));

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

type CanvasProjectEmptyStateEntryOptions = Omit<CanvasProjectEmptyStateOptions, "onUpload" | "onAddText" | "onAddScript" | "onOpenAgent"> & {
    onUploadRequest: () => void;
    onCreateNode: (type: CanvasNodeType) => void;
    openCinematicAgent: () => void;
};

export function renderCanvasProjectEmptyStateEntry({ onUploadRequest, onCreateNode, openCinematicAgent, ...options }: CanvasProjectEmptyStateEntryOptions) {
    return renderCanvasProjectEmptyState({
        ...options,
        onUpload: onUploadRequest,
        onAddText: () => onCreateNode(CanvasNodeType.Text),
        onAddScript: () => onCreateNode(CanvasNodeType.Script),
        onOpenAgent: openCinematicAgent,
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
    if (kind === "freeform") {
        return (
            <Suspense fallback={<CanvasEmptyStateLoading kind={kind} />}>
                <CanvasFreeformEmptyState onUpload={onUpload} onAddText={onAddText} />
            </Suspense>
        );
    }
    if (kind === "short-drama") {
        return (
            <Suspense fallback={<CanvasEmptyStateLoading kind={kind} />}>
                <CanvasShortDramaEmptyState onCreatePipeline={onCreatePipeline} onOpenAgent={onOpenAgent} onUpload={onUpload} onAddText={onAddText} onAddScript={onAddScript} />
            </Suspense>
        );
    }
    if (kind !== "linked-project" || !linkedProjectId) return null;

    const firstChapter = firstCanvasProjectChapter(chapters);
    return (
        <Suspense fallback={<CanvasEmptyStateLoading kind={kind} />}>
            <CanvasLinkedProjectEmptyState
                projectName={linkedProjectName || projectTitle}
                hasChapter={Boolean(firstChapter)}
                onAddFirstChapter={() => {
                    if (firstChapter) void onInsertProjectChapter({ ...firstChapter, projectId: linkedProjectId });
                }}
                onOpenAssets={onOpenAssets}
                onAddText={onAddText}
            />
        </Suspense>
    );
}

function CanvasEmptyStateLoading({ kind }: { kind: "freeform" | "short-drama" | "linked-project" }) {
    const shortDrama = kind === "short-drama";
    const linkedProject = kind === "linked-project";
    return (
        <div className={`pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 ${linkedProject ? "pb-16 pt-20" : "pb-20 pt-24"}`} role="status" aria-live="polite">
            <div className={`w-full rounded-lg border border-current/10 bg-current/[0.02] ${shortDrama ? "h-[288px] max-w-[760px]" : linkedProject ? "h-[104px] max-w-[440px]" : "h-[136px] max-w-[440px]"}`}>
                <span className="sr-only">正在加载空画布入口…</span>
            </div>
        </div>
    );
}
