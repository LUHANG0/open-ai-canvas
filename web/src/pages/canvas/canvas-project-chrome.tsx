import { lazy, Suspense, type ComponentProps } from "react";

import type { CanvasProjectSidebar as CanvasProjectSidebarComponent } from "@/components/canvas/canvas-project-sidebar";
import type { CanvasContextSummary } from "@/lib/canvas/canvas-context-summary";
import { CanvasTopBar } from "./canvas-project-top-bar";
import { buildCanvasProjectTopBarContext, canShowCanvasProjectSidebar, canShowCanvasProjectTopBar } from "./canvas-project-chrome-state";

const CanvasProjectSidebar = lazy(() => import("@/components/canvas/canvas-project-sidebar").then((module) => ({ default: module.CanvasProjectSidebar })));

type CanvasProjectNavigationSidebarProps = ComponentProps<typeof CanvasProjectSidebarComponent> & {
    focusMode: boolean;
    shortDramaEnabled: boolean;
};

export function CanvasProjectNavigationSidebar({ focusMode, shortDramaEnabled, ...sidebarProps }: CanvasProjectNavigationSidebarProps) {
    if (!canShowCanvasProjectSidebar(focusMode, shortDramaEnabled, sidebarProps.projectId)) return null;
    return (
        <Suspense fallback={<CanvasProjectSidebarLoading />}>
            <CanvasProjectSidebar {...sidebarProps} />
        </Suspense>
    );
}

function CanvasProjectSidebarLoading() {
    return (
        <aside
            className="pc-canvas-project-sidebar relative z-[var(--z-panel)] hidden w-[var(--canvas-sidebar-width)] shrink-0 flex-col border-r border-border bg-background/94 backdrop-blur-xl lg:flex"
            aria-label="正在加载项目导航"
            role="status"
            aria-live="polite"
        >
            <div className="flex h-12 shrink-0 items-center border-b border-border px-3 text-xs font-medium text-foreground/45">正在加载项目导航…</div>
            <div className="grid gap-2 p-3" aria-hidden="true">
                <span className="h-8 animate-pulse rounded-md bg-foreground/[.05]" />
                <span className="h-8 animate-pulse rounded-md bg-foreground/[.04]" />
                <span className="h-8 animate-pulse rounded-md bg-foreground/[.03]" />
            </div>
        </aside>
    );
}

type CanvasProjectHeaderProps = {
    focusMode: boolean;
    shortDramaEnabled: boolean;
    linkedProjectId?: string | null;
    linkedProjectName: string;
    context: CanvasContextSummary;
    topBar: Omit<ComponentProps<typeof CanvasTopBar>, "projectContext">;
};

export function CanvasProjectHeader({ focusMode, shortDramaEnabled, linkedProjectId, linkedProjectName, context, topBar }: CanvasProjectHeaderProps) {
    if (!canShowCanvasProjectTopBar(focusMode)) return null;
    const projectContext = buildCanvasProjectTopBarContext(context, shortDramaEnabled, linkedProjectId, linkedProjectName);
    return <CanvasTopBar {...topBar} projectContext={projectContext} />;
}
