import type { ComponentProps, ReactNode } from "react";

import { CanvasActiveTaskPanel } from "@/components/canvas/canvas-active-task-panel";
import { CanvasFileDropOverlay } from "@/components/canvas/canvas-file-drop-overlay";
import { CanvasFocusModeBar } from "@/components/canvas/canvas-focus-mode-bar";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { canvasActiveTaskPanelInsets } from "./canvas-workspace-overlay-state";

type ActiveTasks = ComponentProps<typeof CanvasActiveTaskPanel>["tasks"];
type CancelTask = ComponentProps<typeof CanvasActiveTaskPanel>["onCancelTask"];

type CanvasProjectWorkspaceOverlaysProps = {
    activeTasks: ActiveTasks;
    onCancelTask: CancelTask;
    focusMode: boolean;
    focusDockRevealed: boolean;
    assistantOpen: boolean;
    assistantWidth: number;
    zoomScale: number;
    onToggleFocusDock: () => void;
    onOpenAgent: () => void;
    onCloseAgent: () => void;
    onExitFocusMode: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitContent: () => void;
    fileDropActive: boolean;
    theme: CanvasTheme;
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
            <CanvasActiveTaskPanel tasks={activeTasks} onCancelTask={onCancelTask} topInset={taskInsets.topInset} rightInset={taskInsets.rightInset} />
            {focusMode ? (
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
            ) : null}
            <CanvasFileDropOverlay active={fileDropActive} theme={theme} />
            {emptyCanvasState ? <div className="pc-canvas-empty-stage contents">{emptyCanvasState}</div> : null}
        </>
    );
}
