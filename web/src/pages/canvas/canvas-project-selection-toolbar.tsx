import { lazy, Suspense, type RefObject } from "react";

import { CanvasSelectionToolbar } from "@/components/canvas/canvas-workspace-overlays";
import type { CanvasProjectSelectionToolbarContentProps } from "./canvas-project-selection-toolbar-content";
import { canShowCanvasSelectionToolbar } from "./canvas-selection-toolbar-visibility";

const CanvasProjectSelectionToolbarContent = lazy(() => import("./canvas-project-selection-toolbar-content").then((module) => ({ default: module.CanvasProjectSelectionToolbarContent })));

type CanvasProjectSelectionToolbarProps = CanvasProjectSelectionToolbarContentProps & {
    anchorRef: RefObject<HTMLDivElement | null>;
    containerRef: RefObject<HTMLDivElement | null>;
};

export function CanvasProjectSelectionToolbar({ anchorRef, containerRef, ...contentProps }: CanvasProjectSelectionToolbarProps) {
    return (
        <CanvasSelectionToolbar anchorRef={anchorRef} containerRef={containerRef} count={contentProps.count}>
            <Suspense fallback={<CanvasSelectionToolbarLoading />}>
                <CanvasProjectSelectionToolbarContent {...contentProps} />
            </Suspense>
        </CanvasSelectionToolbar>
    );
}

function CanvasSelectionToolbarLoading() {
    return (
        <div data-canvas-no-zoom className="pointer-events-none flex h-10 min-w-52 items-center gap-2 rounded-full border border-border bg-background/90 px-3 shadow-sm backdrop-blur" role="status" aria-live="polite">
            <span className="h-2 flex-1 animate-pulse rounded-full bg-foreground/[.07]" />
            <span className="h-2 w-12 animate-pulse rounded-full bg-foreground/[.05]" />
            <span className="sr-only">正在加载多选工具…</span>
        </div>
    );
}

type CanvasProjectSelectionToolbarOverlayProps = Omit<CanvasProjectSelectionToolbarProps, "count" | "onBatchConnect" | "onMergeVideos"> & {
    selectionCount: number | null;
    selectionBoxActive: boolean;
    nodeDragging: boolean;
    selectedNodeIds: ReadonlySet<string>;
    onBeginBatchConnection: (nodeIds: string[]) => void;
    onMergeSelectedVideos: () => unknown;
};

export function CanvasProjectSelectionToolbarOverlay({ selectionCount, selectionBoxActive, nodeDragging, selectedNodeIds, onBeginBatchConnection, onMergeSelectedVideos, ...toolbarProps }: CanvasProjectSelectionToolbarOverlayProps) {
    if (!canShowCanvasSelectionToolbar(selectionCount, selectionBoxActive, nodeDragging) || selectionCount === null) return null;
    return <CanvasProjectSelectionToolbar {...toolbarProps} count={selectionCount} onBatchConnect={() => onBeginBatchConnection(Array.from(selectedNodeIds))} onMergeVideos={() => void onMergeSelectedVideos()} />;
}
