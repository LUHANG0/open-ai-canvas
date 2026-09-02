import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";

import type { CanvasActiveTaskPanel as CanvasActiveTaskPanelComponent } from "@/components/canvas/canvas-active-task-panel";
import type { CanvasFileDropOverlay as CanvasFileDropOverlayComponent } from "@/components/canvas/canvas-file-drop-overlay";
import type { CanvasFocusModeBar as CanvasFocusModeBarComponent } from "@/components/canvas/canvas-focus-mode-bar";
import { canvasActiveTaskPanelInsets } from "./canvas-workspace-overlay-state";

const CanvasActiveTaskPanel = lazy(() => import("@/components/canvas/canvas-active-task-panel").then((module) => ({ default: module.CanvasActiveTaskPanel })));
const CanvasFileDropOverlay = lazy(() => import("@/components/canvas/canvas-file-drop-overlay").then((module) => ({ default: module.CanvasFileDropOverlay })));
const CanvasFocusModeBar = lazy(() => import("@/components/canvas/canvas-focus-mode-bar").then((module) => ({ default: module.CanvasFocusModeBar })));

type ActiveTasks = ComponentProps<typeof CanvasActiveTaskPanelComponent>["tasks"];
type CancelTask = ComponentProps<typeof CanvasActiveTaskPanelComponent>["onCancelTask"];
type FileDropOverlayProps = ComponentProps<typeof CanvasFileDropOverlayComponent>;
type FocusModeBarProps = ComponentProps<typeof CanvasFocusModeBarComponent>;

type CanvasProjectWorkspaceOverlaysProps = {
    activeTasks: ActiveTasks;
    onCancelTask: CancelTask;
    focusMode: boolean;
    focusDockRevealed: FocusModeBarProps["dockRevealed"];
    assistantOpen: FocusModeBarProps["agentOpen"];
    assistantWidth: number;
    zoomScale: FocusModeBarProps["zoomPercent"];
    onToggleFocusDock: FocusModeBarProps["onToggleDock"];
    onOpenAgent: () => void;
    onCloseAgent: () => void;
    onExitFocusMode: FocusModeBarProps["onExit"];
    onZoomIn: FocusModeBarProps["onZoomIn"];
    onZoomOut: FocusModeBarProps["onZoomOut"];
    onFitContent: FocusModeBarProps["onFit"];
    fileDropActive: FileDropOverlayProps["active"];
    theme: FileDropOverlayProps["theme"];
    emptyCanvasState: ReactNode;
};

export function CanvasProjectWorkspaceOverlays({
    activeTasks,
    onCancelTask,
    focusMode,
    focusDockRevealed,
    assistantOpen,
    assistantWidth,
    zoomScale,
    onToggleFocusDock,
    onOpenAgent,
    onCloseAgent,
    onExitFocusMode,
    onZoomIn,
    onZoomOut,
    onFitContent,
    fileDropActive,
    theme,
    emptyCanvasState,
}: CanvasProjectWorkspaceOverlaysProps) {
    const taskInsets = canvasActiveTaskPanelInsets(focusMode, assistantOpen, assistantWidth);
    return (
        <>
            {activeTasks.length ? (
                <Suspense fallback={null}>
                    <CanvasActiveTaskPanel tasks={activeTasks} onCancelTask={onCancelTask} topInset={taskInsets.topInset} rightInset={taskInsets.rightInset} />
                </Suspense>
            ) : null}
            {focusMode ? (
                <Suspense fallback={null}>
                    <CanvasFocusModeBar
                        dockRevealed={focusDockRevealed}
                        agentOpen={assistantOpen}
                        rightInset={assistantOpen ? assistantWidth : 0}
                        zoomPercent={zoomScale}
                        onToggleDock={onToggleFocusDock}
                        onToggleAgent={() => (assistantOpen ? onCloseAgent() : onOpenAgent())}
                        onExit={onExitFocusMode}
                        onZoomIn={onZoomIn}
                        onZoomOut={onZoomOut}
                        onFit={onFitContent}
                    />
                </Suspense>
            ) : null}
            {fileDropActive ? (
                <Suspense fallback={null}>
                    <CanvasFileDropOverlay active theme={theme} />
                </Suspense>
            ) : null}
            {emptyCanvasState ? <div className="pc-canvas-empty-stage contents">{emptyCanvasState}</div> : null}
        </>
    );
}
