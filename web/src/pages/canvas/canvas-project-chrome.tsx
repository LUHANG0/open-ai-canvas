import type { ComponentProps } from "react";

import { CanvasProjectSidebar } from "@/components/canvas/canvas-project-sidebar";
import type { CanvasContextSummary } from "@/lib/canvas/canvas-context-summary";
import { CanvasTopBar } from "./canvas-project-top-bar";
import { buildCanvasProjectTopBarContext, canShowCanvasProjectSidebar, canShowCanvasProjectTopBar } from "./canvas-project-chrome-state";

type CanvasProjectNavigationSidebarProps = ComponentProps<typeof CanvasProjectSidebar> & {
    focusMode: boolean;
    shortDramaEnabled: boolean;
};

export function CanvasProjectNavigationSidebar({ focusMode, shortDramaEnabled, ...sidebarProps }: CanvasProjectNavigationSidebarProps) {
    if (!canShowCanvasProjectSidebar(focusMode, shortDramaEnabled, sidebarProps.projectId)) return null;
    return <CanvasProjectSidebar {...sidebarProps} />;
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
