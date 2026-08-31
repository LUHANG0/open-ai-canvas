import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Tooltip } from "antd";
import { ArrowLeft, BookOpenText, Clapperboard, Images, LayoutDashboard, LayoutGrid, Plus, Settings2, type LucideIcon } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router";

import { createCanvasProjectWithRemoteSync } from "@/services/user-data-sync";
import { getProjectCore, getProjectOverview, getProjectUnitWorkspace, linkCanvasUnit, listProjectUnits } from "@/services/api/projects";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import { useWorkspaceTopBarExtension } from "@/components/layout/workspace-top-bar-extension";
import { upsertProjectChapterStoryboard } from "@/lib/canvas/project-chapter-storyboard";
import type { ProjectDetail } from "@/services/api/projects";

import ProjectAssetsView from "./detail/assets";
import ProjectCanvasesView from "./detail/canvases";
import ProjectChaptersView from "./detail/chapters";
import ProjectOverviewView from "./detail/overview";
import ProjectSettingsView from "./detail/settings";
import ProjectWorkflowView from "./detail/workflow";
import { WorkflowChapterNavigator } from "./detail/workflow-chapter-navigator";

import "./projects.css";

type DetailView = "overview" | "chapters" | "workflow" | "canvases" | "assets" | "settings";

const views: Array<{ key: DetailView; label: string; shortLabel: string; icon: LucideIcon }> = [
    { key: "overview", label: "制作概览", shortLabel: "概览", icon: LayoutDashboard },
    { key: "chapters", label: "剧情章节", shortLabel: "章节", icon: BookOpenText },
    { key: "workflow", label: "分镜制作", shortLabel: "分镜", icon: Clapperboard },
    { key: "canvases", label: "项目画布", shortLabel: "画布", icon: LayoutGrid },
    { key: "assets", label: "角色与资产", shortLabel: "资产", icon: Images },
    { key: "settings", label: "项目设置", shortLabel: "设置", icon: Settings2 },
];

export default function ProjectDetailPage() {
    const { projectId = "", view, chapterId, unitId, stage } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const activeView: DetailView = unitId || view === "workflow" ? "workflow" : chapterId ? "chapters" : views.some((item) => item.key === view) ? view as DetailView : "overview";
    const coreQuery = useQuery({
        queryKey: ["project", projectId, "core"],
        queryFn: () => getProjectCore(projectId),
        enabled: Boolean(projectId),
        refetchOnMount: "always",
    });
    const unitsQuery = useQuery({ queryKey: ["project", projectId, "units"], queryFn: () => listProjectUnits(projectId), enabled: Boolean(projectId) });
    const units = unitsQuery.data?.units || [];
    const firstUnitId = units.slice().sort((left, right) => left.position - right.position)[0]?.id || "";
    const requestedUnitId = chapterId || unitId || "";
    const activeUnitId = units.some((unit) => unit.id === requestedUnitId) ? requestedUnitId : firstUnitId;
    const overviewQuery = useQuery({ queryKey: ["project", projectId, "overview"], queryFn: () => getProjectOverview(projectId), enabled: Boolean(projectId) && activeView === "overview" });
    const workspaceQuery = useQuery({
        queryKey: ["project", projectId, "unit-workspace", activeUnitId],
        queryFn: () => getProjectUnitWorkspace(projectId, activeUnitId),
        enabled: Boolean(projectId && activeUnitId) && (activeView === "chapters" || activeView === "workflow"),
        refetchInterval: (query) => (query.state.data?.tasks || []).some((task) => task.clientContext?.shotId && (task.status === "queued" || task.status === "running")) ? 2_000 : false,
    });
    const project = coreQuery.data?.project;
    const workspace = workspaceQuery.data;
    const detail: ProjectDetail | undefined = project ? {
        project,
        units: workspace?.unit ? units.map((unit) => unit.id === workspace.unit.id ? workspace.unit : unit) : units,
        canvases: [],
        canvasUnitLinks: [],
        unitCanvasCounts: unitsQuery.data?.canvasCounts || {},
        assets: workspace?.assets || [],
        assetFolders: [],
        workflows: workspace?.workflows || [],
        shots: workspace?.shots || [],
        shotRevisions: workspace?.shotRevisions || [],
        shotArtifacts: workspace?.shotArtifacts || [],
        shotReferences: workspace?.shotReferences || [],
        assetCandidates: workspace?.assetCandidates || [],
        tasks: workspace?.tasks || [],
    } : undefined;
    const refreshProject = () => { void queryClient.invalidateQueries({ queryKey: ["project", projectId] }); void queryClient.invalidateQueries({ queryKey: ["projects"] }); };
    const createCanvas = () => {
        if (detail?.project.status === "archived") { message.warning("项目已归档，请先在项目设置中恢复"); return; }
        const activeChapterId = chapterId || sessionStorage.getItem(`project-active-chapter:${projectId}`) || "";
        const unit = activeView === "chapters"
            ? detail?.units.find((item) => item.id === activeChapterId) || detail?.units.slice().sort((left, right) => left.position - right.position)[0]
            : undefined;
        const shots = unit ? detail?.shots.filter((shot) => shot.unitId === unit.id) || [] : [];
        const seed = unit && shots.length ? upsertProjectChapterStoryboard([], [], { unit, shots }) : undefined;
        const initialContent = seed ? { nodes: seed.nodes, connections: seed.connections } : undefined;
        const title = unit ? `${unit.title} · ${shots.length ? "分镜画布" : "画布"}` : `${detail?.project.name || "项目"} · 新画布`;
        void createCanvasProjectWithRemoteSync(title, projectId, initialContent).then(async ({ id, syncError }) => {
            if (syncError) {
                message.warning(syncError instanceof Error ? `画布已保存在本地，项目关联稍后重试：${syncError.message}` : "画布已保存在本地，项目关联稍后重试");
                navigate(`/canvas/${id}`);
                return;
            }
            if (unit) {
                try {
                    await linkCanvasUnit(projectId, { canvasId: id, unitId: unit.id, role: "storyboard" });
                } catch (error) {
                    refreshProject();
                    message.error(error instanceof Error ? `画布已创建，但章节关联失败：${error.message}` : "画布已创建，但章节关联失败");
                    return;
                }
            }
            refreshProject();
            message.success(unit && shots.length ? `已创建章节画布并导入 ${shots.length} 个分镜` : unit ? "章节画布已创建并关联" : "项目画布已创建");
            navigate(`/canvas/${id}`);
        }).catch((error) => message.error(error instanceof Error ? error.message : "画布创建失败"));
    };
    const chapterHref = detail ? projectChapterHref(detail.units, projectId, chapterId) : `/projects/${projectId}/chapters`;
    const workflowHref = detail ? projectWorkflowHref(detail.units, projectId, unitId, stage) : `/projects/${projectId}/workflow`;
    useWorkspaceTopBarExtension(detail ? (
        <ProjectWorkspaceTopBar
            detail={detail}
            projectId={projectId}
            activeView={activeView}
            unitId={unitId}
            stage={stage}
            chapterHref={chapterHref}
            workflowHref={workflowHref}
            onCreateCanvas={createCanvas}
        />
    ) : null);
    if (coreQuery.isLoading || unitsQuery.isLoading) return <WorkspacePage><WorkspaceLoadingState label="正在打开项目工作台" detail="读取项目与章节索引" /></WorkspacePage>;
    if (coreQuery.isError || unitsQuery.isError || !detail) return <WorkspacePage><WorkspaceErrorState title="项目不可用" description="项目不存在、已被删除，或当前账号没有访问权限。" actionLabel="返回项目中心" onRetry={() => navigate("/projects")} /></WorkspacePage>;
    if (!chapterId && !unitId && (!view || !views.some((item) => item.key === view))) return <Navigate to={`/projects/${projectId}/overview`} replace />;
    if (chapterId && !units.some((unit) => unit.id === chapterId)) return <Navigate to={firstUnitId ? `/projects/${projectId}/chapters/${firstUnitId}` : `/projects/${projectId}/chapters`} replace />;
    if (unitId && !units.some((unit) => unit.id === unitId)) return <Navigate to={firstUnitId ? `/projects/${projectId}/workflow/${firstUnitId}/${stage || "video"}` : `/projects/${projectId}/workflow`} replace />;
    if (activeView === "workflow" && !unitId && detail.units.length) return <Navigate to={`/projects/${projectId}/workflow/${detail.units.slice().sort((left, right) => left.position - right.position)[0].id}/video`} replace />;
    return (
        <WorkspacePage className="project-workbench-page pc-project-workbench" fluid scroll={false}>
            <div className="pc-project-workbench-frame flex h-full min-h-0 flex-col">
                {detail.project.status === "archived" ? <Alert type="warning" showIcon banner message="项目已归档，恢复后才能创建画布和生成任务" className="pc-project-archive-alert" /> : null}
                <main className="pc-project-workbench-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className={activeView === "chapters" || activeView === "workflow" ? "pc-project-view-stage min-h-0 flex-1" : "pc-project-view-scroll thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5 lg:px-0 lg:py-0"}>
                        <div className={activeView === "chapters" || activeView === "workflow" ? "pc-project-view-content is-workbench h-full w-full" : `pc-project-view-content is-${activeView} w-full`}>
                            {activeView === "overview" ? overviewQuery.isLoading ? <WorkspaceLoadingState label="正在统计制作进度" detail="只读取聚合数据，不加载全部镜头历史" /> : overviewQuery.data ? <ProjectOverviewView detail={detail} overview={overviewQuery.data} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : <WorkspaceErrorState title="制作概览读取失败" description="请稍后重试。" onRetry={() => void overviewQuery.refetch()} /> : null}
                            {activeView === "chapters" ? workspaceQuery.isLoading ? <WorkspaceLoadingState label="正在读取当前章节" detail="正文与制作数据按章节加载" /> : workspaceQuery.isError ? <WorkspaceErrorState title="章节读取失败" description="当前章节可能已被删除，或服务暂时不可用。" onRetry={() => void workspaceQuery.refetch()} /> : <ProjectChaptersView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                            {activeView === "workflow" ? workspaceQuery.isLoading ? <WorkspaceLoadingState label="正在读取当前章节分镜" detail="仅加载本章镜头、版本和产物" /> : workspaceQuery.isError ? <WorkspaceErrorState title="分镜工作区读取失败" description="当前章节制作数据暂时不可用。" onRetry={() => void workspaceQuery.refetch()} /> : <ProjectWorkflowView detail={detail} projectId={projectId} unitId={unitId || ""} stage={stage || "video"} /> : null}
                            {activeView === "canvases" ? <ProjectCanvasesView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                            {activeView === "assets" ? <ProjectAssetsView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                            {activeView === "settings" ? <ProjectSettingsView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                        </div>
                    </div>
                </main>
            </div>
        </WorkspacePage>
    );
}

function ProjectWorkspaceTopBar({ detail, projectId, activeView, unitId, stage, chapterHref, workflowHref, onCreateCanvas }: { detail: ProjectDetail; projectId: string; activeView: DetailView; unitId?: string; stage?: string; chapterHref: string; workflowHref: string; onCreateCanvas: () => void }) {
    const navigate = useNavigate();
    return (
        <div className="project-workspace-topbar pc-project-topbar flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => navigate("/projects")} className="pc-project-topbar-back grid size-8 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none" aria-label="返回项目列表" title="返回项目列表"><ArrowLeft className="size-4" /></button>
            <div className="pc-project-topbar-identity hidden min-w-0 items-center gap-2 md:flex">
                <h1 className="min-w-0 truncate">{detail.project.name}</h1>
                <span className={detail.project.status === "archived" ? "pc-project-status-dot is-archived" : "pc-project-status-dot is-active"} aria-hidden="true" />
                <span className="pc-project-topbar-status hidden shrink-0 xl:inline">{detail.project.status === "archived" ? "已归档" : "进行中"}</span>
            </div>
            <nav className="pc-project-topbar-nav thin-scrollbar flex h-11 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" aria-label="项目导航">
                {views.map((item) => { const Icon = item.icon; const active = item.key === activeView; const href = item.key === "chapters" ? chapterHref : item.key === "workflow" ? workflowHref : `/projects/${projectId}/${item.key}`; return <Link key={item.key} to={href} className={active ? "pc-project-topbar-link is-active" : "pc-project-topbar-link"} aria-current={active ? "page" : undefined}><Icon className="size-3.5 shrink-0" /><span className="xl:hidden">{item.shortLabel}</span><span className="hidden xl:inline">{item.label}</span></Link>; })}
            </nav>
            {activeView === "workflow" ? (
                <WorkflowChapterNavigator projectId={projectId} units={detail.units} unitId={unitId} stage={stage} />
            ) : (
                <Tooltip title={activeView === "chapters" && detail.units.length ? "新建当前章节画布" : "新建项目画布"}><Button type="primary" size="small" className="pc-project-topbar-create" icon={<Plus className="size-3.5" />} onClick={onCreateCanvas} aria-label={activeView === "chapters" && detail.units.length ? "新建当前章节画布" : "新建项目画布"}><span className="hidden xl:inline">新建画布</span></Button></Tooltip>
            )}
        </div>
    );
}

function projectWorkflowHref(units: Array<{ id: string; position: number }>, projectId: string, routeUnitId?: string, routeStage?: string) {
    const targetId = [routeUnitId, sessionStorage.getItem(`project-active-chapter:${projectId}`) || ""].find((id) => id && units.some((unit) => unit.id === id)) || units.slice().sort((left, right) => left.position - right.position)[0]?.id;
    return targetId ? `/projects/${projectId}/workflow/${targetId}/${routeStage || "video"}` : `/projects/${projectId}/workflow`;
}

function projectChapterHref(units: Array<{ id: string; position: number }>, projectId: string, routeChapterId?: string) {
    const rememberedId = sessionStorage.getItem(`project-active-chapter:${projectId}`) || "";
    const targetId = [routeChapterId, rememberedId].find((id) => id && units.some((unit) => unit.id === id)) || units.slice().sort((left, right) => left.position - right.position)[0]?.id;
    return targetId ? `/projects/${projectId}/chapters/${targetId}` : `/projects/${projectId}/chapters`;
}
