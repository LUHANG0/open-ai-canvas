import { Fragment, type CSSProperties } from "react";
import { Check, ChevronUp, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import type { CanvasShortDramaProgress, CanvasShortDramaStepId } from "@/lib/canvas/canvas-short-drama";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasShortDramaGuideProps = {
    progress: CanvasShortDramaProgress;
    collapsed: boolean;
    onToggle: () => void;
    onSkip: () => void;
    onStepClick: (stepId: CanvasShortDramaStepId) => void;
};

export function CanvasShortDramaGuide({ progress, collapsed, onToggle, onSkip, onStepClick }: CanvasShortDramaGuideProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!progress.active || collapsed) return null;
    return (
        <div
            data-canvas-no-zoom
            className="absolute left-1/2 top-[var(--canvas-topbar-offset)] z-[var(--z-toolbar)] flex max-w-[calc(100%_-_24px)] -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-sm backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
        >
            <div className="hide-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
                <div className="flex shrink-0 items-center px-[var(--space-1)]">
                    {progress.steps.map((step, index) => (
                        <Fragment key={step.id}>
                            {index ? (
                                <span
                                    aria-hidden
                                    className="shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none"
                                    style={{ width: "var(--flow-step-track-width)", height: "var(--flow-step-track-height)", background: step.status === "pending" ? theme.node.stroke : theme.accent.primary }}
                                />
                            ) : null}
                            <button
                                type="button"
                                aria-current={step.status === "current" ? "step" : undefined}
                                className="flex h-8 shrink-0 items-center gap-[var(--flow-step-gap)] rounded-md px-[var(--space-1-half)] outline-none transition-colors motion-reduce:transition-none hover:bg-black/5 focus-visible:ring-1 focus-visible:ring-inset dark:hover:bg-white/10"
                                style={{ "--tw-ring-color": theme.accent.primary } as CSSProperties}
                                onClick={() => onStepClick(step.id)}
                            >
                                <span
                                    className="grid shrink-0 place-items-center rounded-full font-semibold transition-all duration-150 motion-reduce:transition-none"
                                    style={{
                                        width: step.status === "current" ? "var(--flow-step-node-current)" : "var(--flow-step-node)",
                                        height: step.status === "current" ? "var(--flow-step-node-current)" : "var(--flow-step-node)",
                                        background: step.status === "pending" ? "transparent" : theme.accent.primary,
                                        border: step.status === "pending" ? "var(--stroke-2) solid var(--cn-stroke)" : "none",
                                        color: step.status === "pending" ? theme.node.muted : theme.accent.onPrimary,
                                        boxShadow: step.status === "current" ? "var(--flow-step-current-glow)" : undefined,
                                        fontSize: step.status === "current" ? "var(--fs-body)" : "var(--fs-caption)",
                                    }}
                                >
                                    {step.status === "completed" ? <Check className="size-3.5" /> : index + 1}
                                </span>
                                <span
                                    className="whitespace-nowrap text-[var(--fs-caption)] font-semibold transition-colors duration-150 motion-reduce:transition-none"
                                    style={{ color: step.status === "current" ? theme.accent.primary : step.status === "completed" ? theme.node.text : theme.node.muted }}
                                >
                                    {step.label}
                                </span>
                            </button>
                        </Fragment>
                    ))}
                </div>
            </div>
            <span className="mx-1 h-4 w-px shrink-0" style={{ background: theme.toolbar.border }} />
            {!progress.completed ? (
                <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[var(--fs-label)] outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                    style={{ color: theme.node.muted, "--tw-ring-color": theme.accent.primary } as CSSProperties}
                    onClick={onSkip}
                >
                    <X className="size-3" />
                    跳过导引
                </button>
            ) : null}
            <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                style={{ color: theme.node.muted, "--tw-ring-color": theme.accent.primary } as CSSProperties}
                onClick={onToggle}
                aria-label="折叠短剧流程"
            >
                <ChevronUp className="size-3.5" />
            </button>
        </div>
    );
}
