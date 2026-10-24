const workspaceRouteLoaders = {
    assets: () => import("@/pages/assets"),
    canvas: () => import("@/pages/canvas"),
    create: () => import("@/pages/create"),
    projects: () => import("@/pages/projects"),
    tasks: () => import("@/pages/tasks"),
    skills: () => import("@/pages/skills"),
    plugins: () => import("@/pages/plugins"),
    image: () => import("@/pages/workbench/image-workbench-route"),
    video: () => import("@/pages/workbench/video-workbench-page"),
    projectDetail: () => import("@/pages/projects/detail"),
};

export const loadAssetsPage = workspaceRouteLoaders.assets;
export const loadCanvasPage = workspaceRouteLoaders.canvas;
export const loadCanvasProjectPage = () => import("@/pages/canvas/project");
export const loadCreatePage = workspaceRouteLoaders.create;
export const loadProjectDetailPage = workspaceRouteLoaders.projectDetail;
export const loadProjectsPage = workspaceRouteLoaders.projects;
export const loadTasksPage = workspaceRouteLoaders.tasks;
export const loadSkillsPage = workspaceRouteLoaders.skills;
export const loadPluginsPage = workspaceRouteLoaders.plugins;
export const loadImageWorkbenchPage = workspaceRouteLoaders.image;
export const loadVideoWorkbenchPage = workspaceRouteLoaders.video;

export function preloadWorkspaceRoute(pathnameOrSlug: string) {
    // 品牌根页独立加载；只有实际工作台路径才预加载业务模块。
    const segments = pathnameOrSlug.replace(/^\//, "").split("/").filter(Boolean);
    const slug = segments[0];
    if (slug === "toolbox") {
        const load = segments[1] === "image" ? workspaceRouteLoaders.image : segments[1] === "video" ? workspaceRouteLoaders.video : undefined;
        if (load) void load().catch(() => undefined);
        return;
    }
    // 具体画布项目由 /canvas/:id 自己加载；不要在认证恢复阶段额外预加载画布列表。
    if (slug === "canvas" && segments.length > 1) return;
    if (slug === "projects" && segments.length > 1) {
        void workspaceRouteLoaders.projectDetail().catch(() => undefined);
        return;
    }
    const load = workspaceRouteLoaders[slug as keyof typeof workspaceRouteLoaders];
    // Prefetch is optional; navigation owns the error boundary and reload action.
    if (load) void load().catch(() => undefined);
}
