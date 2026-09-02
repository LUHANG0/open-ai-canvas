import { lazy, Suspense } from "react";

import type { CanvasShortDramaGuideProps } from "@/components/canvas/canvas-short-drama-guide";
import type { CanvasWorkspaceMode } from "@/types/canvas";
import { CanvasWorkspaceModeSwitch } from "./canvas-project-top-bar";
import { canShowCanvasWorkspaceChrome, canvasWorkspaceModeSwitchRightInset } from "./canvas-workspace-chrome-state";

const CanvasShortDramaGuide = lazy(() => import("@/components/canvas/canvas-short-drama-guide").then((module) => ({ default: module.CanvasShortDramaGuide })));

type ShortDramaGuideState = Pick<CanvasShortDramaGuideProps, "progress" | "collapsed" | "onToggle">;

type CanvasProjectWorkspaceModeSwitchProps = {
    focusMode: boolean;
    assistantOpen: boolean;
    assistantWidth: number;
    workspaceMode: CanvasWorkspaceMode;
    onWorkspaceModeChange: (mode: CanvasWorkspaceMode) => void;
};

export function CanvasProjectWorkspaceModeSwitch({ focusMode, assistantOpen, assistantWidth, workspaceMode, onWorkspaceModeChange }: CanvasProjectWorkspaceModeSwitchProps) {
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
    onSkip: CanvasShortDramaGuideProps["onSkip"];
    onStepClick: CanvasShortDramaGuideProps["onStepClick"];
};

export function CanvasProjectShortDramaGuide({ focusMode, guide, onSkip, onStepClick }: CanvasProjectShortDramaGuideProps) {
    if (!canShowCanvasWorkspaceChrome(focusMode) || !guide) return null;
    return (
        <Suspense fallback={guide.progress.active && !guide.collapsed ? <CanvasShortDramaGuideLoading /> : null}>
            <CanvasShortDramaGuide progress={guide.progress} collapsed={guide.collapsed} onToggle={guide.onToggle} onSkip={onSkip} onStepClick={onStepClick} />
        </Suspense>
    );
}

function CanvasShortDramaGuideLoading() {
    return (
        <div
            data-canvas-no-zoom
            className="pointer-events-none absolute left-1/2 top-[var(--canvas-topbar-offset)] z-[var(--z-toolbar)] flex h-10 w-[720px] max-w-[calc(100%_-_24px)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-background/90 px-3 shadow-sm backdrop-blur"
            role="status"
            aria-live="polite"
        >
            <span className="h-2 flex-1 animate-pulse rounded-full bg-foreground/[.07]" />
            <span className="h-2 w-24 animate-pulse rounded-full bg-foreground/[.05]" />
            <span className="sr-only">正在加载短剧流程…</span>
        </div>
    );
}
