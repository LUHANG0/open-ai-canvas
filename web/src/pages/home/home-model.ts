export type HomeSectionState = "disabled" | "loading" | "ready" | "error";

export type HomeMode = "project" | "returning" | "empty";

export type HomeModeInput = {
    activeProjectId?: string;
    projectCount: number;
    canvasCount: number;
    assetCount: number;
    taskCount: number;
    projectsState: HomeSectionState;
    tasksState: HomeSectionState;
};

export type HomePrimaryAction = {
    label: "继续制作" | "继续创作" | "立即创作";
    to: string;
};

export function deriveHomeMode(input: HomeModeInput): HomeMode {
    if (input.activeProjectId) return "project";

    const hasActivity = input.projectCount + input.canvasCount + input.assetCount + input.taskCount > 0;
    const hasUnresolvedHistory = input.projectsState === "loading" || input.projectsState === "error" || input.tasksState === "loading" || input.tasksState === "error";
    return hasActivity || hasUnresolvedHistory ? "returning" : "empty";
}

export function homePrimaryAction(mode: HomeMode, activeProjectId?: string): HomePrimaryAction {
    if (mode === "project" && activeProjectId) {
        return { label: "继续制作", to: `/projects/${activeProjectId}/overview` };
    }
    if (mode === "returning") return { label: "继续创作", to: "/create" };
    return { label: "立即创作", to: "/create" };
}

export function projectCreateHref(userPresent: boolean) {
    return userPresent ? "/projects?create=1" : `/login?next=${encodeURIComponent("/projects?create=1")}`;
}

export type NewCanvasIntent = { kind: "disabled" } | { kind: "login"; to: string } | { kind: "create" };

export function newCanvasIntent(input: { hydrated: boolean; userPresent: boolean }): NewCanvasIntent {
    if (!input.hydrated) return { kind: "disabled" };
    if (!input.userPresent) return { kind: "login", to: `/login?next=${encodeURIComponent("/canvas?mode=new")}` };
    return { kind: "create" };
}

export function shouldShowTaskSection(taskCenterEnabled: boolean) {
    return taskCenterEnabled;
}

export function shouldShowProjectControls(projectCount: number) {
    return projectCount > 0;
}
