import { lazy, Suspense } from "react";

import type { CanvasAssistantPanelProps } from "@/components/canvas/canvas-assistant-panel";
import { AssistantPanelColumn } from "./canvas-assistant-panel-column";
import { canvasAssistantColumnTopInset } from "./canvas-assistant-column-state";

export const loadCanvasAssistantPanel = () => import("@/components/canvas/canvas-assistant-panel").then((module) => ({ default: module.CanvasAssistantPanel }));
const CanvasAssistantPanel = lazy(loadCanvasAssistantPanel);

type CanvasProjectAssistantColumnProps = {
    mounted: boolean;
    width: number;
    closing: boolean;
    focusMode: boolean;
    onWidthChange: (width: number) => void;
    panelProps: Omit<CanvasAssistantPanelProps, "closing">;
};

export function CanvasProjectAssistantColumn({ mounted, width, closing, focusMode, onWidthChange, panelProps }: CanvasProjectAssistantColumnProps) {
    if (!mounted) return null;

    return (
        <AssistantPanelColumn width={width} closing={closing} topInset={canvasAssistantColumnTopInset(focusMode)} onWidthChange={onWidthChange}>
            {() => (
                <Suspense fallback={<div data-canvas-no-zoom className="grid h-full min-h-0 place-items-center px-6 text-sm text-foreground/55">正在准备 Agent…</div>}>
                    <CanvasAssistantPanel {...panelProps} closing={closing} />
                </Suspense>
            )}
        </AssistantPanelColumn>
    );
}
