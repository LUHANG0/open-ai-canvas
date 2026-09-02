import type { ComponentProps } from "react";

import { CanvasShortDramaGuide } from "@/components/canvas/canvas-short-drama-entry";
import type { CanvasWorkspaceMode } from "@/types/canvas";
import { CanvasWorkspaceModeSwitch } from "./canvas-project-top-bar";
import { canShowCanvasWorkspaceChrome, canvasWorkspaceModeSwitchRightInset } from "./canvas-workspace-chrome-state";

type ShortDramaGuideState = Pick<ComponentProps<typeof CanvasShortDramaGuide>, "progress" | "collapsed" | "onToggle">;

type CanvasProjectWorkspaceModeSwitchProps = {
    focusMode: boolean;
    assistantOpen: boolean;
    assistantWidth: number;
    workspaceMode: CanvasWorkspaceMode;
    onWorkspaceModeChange: (mode: CanvasWorkspaceMode) => void;
};

export function CanvasProjectWorkspaceModeSwitch({
    focusMode,
    assistantOpen,
    assistantWidth,
    workspaceMode,
    onWorkspaceModeChange,
}: CanvasProjectWorkspaceModeSwitchProps) {
    if (!canShowCanvasWorkspaceChrome(focusMode)) return null;

    return (
        <div
            data-canvas-no-zoom
            className="pc-canvas-workspace__mode-switch pointer-events-none absolute bottom-[calc(var(--canvas-inset-y)+var(--space-16))] z-[var(--z-toolbar)] transition-[bottom] duration-300 lg:bottom-[var(--canvas-inset-y)]"
            style={{ right: canvasWorkspaceModeSwitchRightInset(assistantOpen, assistantWidth) }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <CanvasWorkspaceModeSwitch mode={workspaceMode} onChange={onWorkspaceModeChange} />
        </div>
    );
}

type CanvasProjectShortDramaGuideProps = {
    focusMode: boolean;
    guide?: ShortDramaGuideState;
    onSkip: ComponentProps<typeof CanvasShortDramaGuide>["onSkip"];
    onStepClick: ComponentProps<typeof CanvasShortDramaGuide>["onStepClick"];
};

export function CanvasProjectShortDramaGuide({ focusMode, guide, onSkip, onStepClick }: CanvasProjectShortDramaGuideProps) {
    if (!canShowCanvasWorkspaceChrome(focusMode) || !guide) return null;
    return <CanvasShortDramaGuide progress={guide.progress} collapsed={guide.collapsed} onToggle={guide.onToggle} onSkip={onSkip} onStepClick={onStepClick} />;
}
