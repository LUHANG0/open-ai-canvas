import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button } from "antd";
import { AlertTriangle, ArrowRight, Clapperboard, FolderKanban, Images, LayoutGrid, ListTodo, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

import { resolveCanvasStylePreset, resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { useBranding } from "@/components/branding/branding-provider";
import { WorkspacePage } from "@/components/ui/pc/page";
import { WorkspaceLoadingState } from "@/components/ui/pc/workspace-state";
import { parseStyleProfile } from "@/lib/canvas/style-profile";
import { projectSummaryCompletion, projectSummaryStage } from "@/lib/project-workbench";
import { listProjects, type ProjectSummary } from "@/services/api/projects";
import { resourceFileUrl } from "@/services/api/resources";
import { listGenerationTasks, type GenerationTask } from "@/services/api/task-center";
import { createCanvasProjectWithRemoteSync } from "@/services/user-data-sync";
import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useUserStore, type LocalUser } from "@/stores/use-user-store";

import { deriveHomeMode, homePrimaryAction, newCanvasIntent, projectCreateHref, shouldShowTaskSection, type HomeSectionState } from "./home-model";
import "./home-pc.css";

const WORKFLOW = [
    { title: "说出想法", description: "用一句描述确定画面或故事方向" },
    { title: "生成候选", description: "快速获得图片或视频版本" },
    { title: "组织制作", description: "需要完整流程时建立短剧项目" },
    { title: "沉淀交付", description: "把可用结果整理到画布与素材库" },
];

const SOURCE_TYPE_LABELS: Record<string, string> = { blank: "空白开始", novel: "导入小说", text: "粘贴文本" };

const ASSET_KINDS: Array<{ key: AssetKind; label: string }> = [
    { key: "image", label: "图片" },
    { key: "video", label: "视频" },
    { key: "audio", label: "音频" },
    { key: "text", label: "文本" },
    { key: "entity", label: "实体" },
    { key: "model", label: "模型" },
];

const CHART_BRAND = "var(--home-chart-brand, var(--app-action-primary-bg))";
const CHART_BRAND_MUTED = "color-mix(in srgb, var(--home-chart-brand, var(--app-action-primary-bg)) 36%, transparent)";
const CHART_AI = "var(--home-chart-ai, var(--app-status-running-fg))";

export default function IndexPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const assetHydrated = useAssetStore((state) => state.hydrated);
    const assets = useAssetStore((state) => state.assets);
    const user = useUserStore((state) => state.user);
    const userHydrated = useUserStore((state) => state.hydrated);
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled);
    const taskCenterEnabled = useUserStore((state) => state.features.taskCenterEnabled);

    const domainProjectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => listProjects(), enabled: Boolean(user && shortDramaEnabled) });
    const domainProjects = useMemo(() => [...(domainProjectsQuery.data?.projects || [])].sort((left, right) => right.project.updatedAt.localeCompare(left.project.updatedAt)), [domainProjectsQuery.data]);

    // 首页只复用任务中心已有的最近 300 条口径，不追加逐项目请求。
    const tasksQuery = useQuery({ queryKey: ["home-dashboard-tasks"], queryFn: () => listGenerationTasks(300), enabled: Boolean(user && taskCenterEnabled) });
    const tasks = useMemo(() => tasksQuery.data || [], [tasksQuery.data]);
    const projectsState: HomeSectionState = !user || !shortDramaEnabled ? "disabled" : domainProjectsQuery.isLoading ? "loading" : domainProjectsQuery.isError ? "error" : "ready";
    const tasksState: HomeSectionState = !user || !taskCenterEnabled ? "disabled" : tasksQuery.isLoading ? "loading" : tasksQuery.isError ? "error" : "ready";

    const createIndependentCanvas = () => {
        const intent = newCanvasIntent({ hydrated: canvasHydrated, userPresent: Boolean(user) });
        if (intent.kind === "disabled") return;
        if (intent.kind === "login") {
            navigate(intent.to);
            return;
        }
        void createCanvasProjectWithRemoteSync(`自由画布 ${canvasProjects.length + 1}`).then(({ id, syncError }) => {
            if (syncError) message.warning(syncError instanceof Error ? `画布已在本地创建，云端同步失败：${syncError.message}` : "画布已在本地创建，云端同步失败");
            navigate(`/canvas/${id}`);
        });
    };

    return (
        <WorkspacePage className="pc-core-page pc-home-page" contentClassName="app-home-dashboard pc-home-page__content">
            {!userHydrated ? (
                <WorkspaceLoadingState label="正在恢复工作台" detail="读取账号与创作空间" rows={4} />
            ) : (
                <HomeWorkspace
                    user={user}
                    shortDramaEnabled={shortDramaEnabled}
                    taskCenterEnabled={taskCenterEnabled}
                    domainProjects={domainProjects}
                    canvasProjects={canvasProjects}
                    assets={assets}
                    tasks={tasks}
                    projectsState={projectsState}
                    tasksState={tasksState}
                    localDataHydrated={canvasHydrated && assetHydrated}
                    onCreateIndependentCanvas={createIndependentCanvas}
                    onRetryProjects={() => void domainProjectsQuery.refetch()}
                    onRetryTasks={() => void tasksQuery.refetch()}
                />
            )}
        </WorkspacePage>
    );
}

type HomeWorkspaceProps = {
    user: LocalUser | null;
    shortDramaEnabled: boolean;
    taskCenterEnabled: boolean;
    domainProjects: ProjectSummary[];
    canvasProjects: CanvasProject[];
    assets: Asset[];
    tasks: GenerationTask[];
    projectsState: HomeSectionState;
    tasksState: HomeSectionState;
    localDataHydrated: boolean;
    onCreateIndependentCanvas: () => void;
    onRetryProjects: () => void;
    onRetryTasks: () => void;
};

function HomeWorkspace(props: HomeWorkspaceProps) {
    const { branding } = useBranding();
    const reducedMotion = useReducedMotion();
    const activeProjects = useMemo(() => props.domainProjects.filter(({ project }) => project.status !== "archived"), [props.domainProjects]);
    const activeProject = activeProjects[0];
    const independentCanvases = useMemo(() => props.canvasProjects.filter((project) => !project.projectId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [props.canvasProjects]);
    const sortedAssets = useMemo(() => [...props.assets].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [props.assets]);
    const sortedTasks = useMemo(() => [...props.tasks].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [props.tasks]);
    const mode = deriveHomeMode({
        activeProjectId: activeProject?.project.id,
        projectCount: props.domainProjects.length,
        canvasCount: independentCanvases.length,
        assetCount: props.assets.length,
        taskCount: props.tasks.length,
        projectsState: props.projectsState,
        tasksState: props.tasksState,
    });
    const primaryAction = homePrimaryAction(mode, activeProject?.project.id);
    const createProjectHref = projectCreateHref(Boolean(props.user));
    const latestPreview = resolveLatestPreview(activeProject, sortedAssets, sortedTasks);
    const weekStats = useMemo(() => buildWeekStats(props.tasks), [props.tasks]);
    const assetKindCounts = useMemo(() => countAssetKinds(props.assets), [props.assets]);
    const totalUnits = useMemo(() => activeProjects.reduce((sum, row) => sum + row.unitCount, 0), [activeProjects]);
    const archivedCount = props.domainProjects.length - activeProjects.length;
    const latestCanvasUpdate = independentCanvases[0]?.updatedAt;
    const heroCopy = getHeroCopy(mode, activeProject, props.user, branding.config.identity.shortName, props.projectsState, props.tasksState);
    const [rangeDays, setRangeDays] = useState(14);
    const activityData = useMemo(
        () =>
            buildActivityBuckets(
                rangeDays,
                props.tasks.map((task) => new Date(task.createdAt).getTime()),
                props.canvasProjects.map((project) => new Date(project.updatedAt).getTime()),
            ),
        [rangeDays, props.tasks, props.canvasProjects],
    );
    const hasActivityChart = activityData.some((item) => item.tasks > 0 || item.canvases > 0);
    const assetChartEntries = useMemo(() => assetChartData(props.assets), [props.assets]);

    return (
        <>
            <section className={`home-hero is-${mode}`} aria-labelledby="home-hero-title">
                <div className="home-hero__copy">
                    <p className="home-hero__eyebrow">
                        <Clapperboard aria-hidden="true" />
                        {branding.config.identity.shortName} · 创作工作台
                    </p>
                    <h1 id="home-hero-title">{heroCopy.title}</h1>
                    <p className="home-hero__description">{heroCopy.description}</p>
                    {activeProject ? (
                        <div className="home-hero__progress" aria-label={`${activeProject.project.name}完成度 ${projectSummaryCompletion(activeProject)}%`}>
                            <span>{projectSummaryStage(activeProject).label}</span>
                            <span className="home-progress-track" aria-hidden="true">
                                <span className="home-progress-fill" style={{ width: `${projectSummaryCompletion(activeProject)}%` }} />
                            </span>
                            <strong>{projectSummaryCompletion(activeProject)}%</strong>
                            <time dateTime={activeProject.project.updatedAt}>{formatRelativeTime(activeProject.project.updatedAt)}更新</time>
                        </div>
                    ) : heroCopy.status ? (
                        <p className="home-hero__status">{heroCopy.status}</p>
                    ) : null}
                    <div className="home-hero__actions">
                        <Link className="home-primary-action" to={primaryAction.to}>
                            <Sparkles aria-hidden="true" />
                            {primaryAction.label}
                        </Link>
                        {mode === "project" ? (
                            <Link className="home-secondary-action" to="/create">
                                开始新创作
                            </Link>
                        ) : props.shortDramaEnabled ? (
                            <Link className="home-secondary-action" to={createProjectHref}>
                                创建短剧项目
                            </Link>
                        ) : null}
                        {mode === "project" && props.shortDramaEnabled ? (
                            <Link className="home-text-action" to={createProjectHref}>
                                新建短剧项目
                            </Link>
                        ) : null}
                        <button type="button" className="home-text-action" disabled={!props.localDataHydrated} onClick={props.onCreateIndependentCanvas}>
                            新建自由画布
                        </button>
                    </div>
                </div>
                <HeroVisual mode={mode} activeProject={activeProject} latestPreview={latestPreview} canvas={independentCanvases[0]} task={sortedTasks[0]} />
            </section>

            {mode === "empty" ? (
                <OnboardingSection shortDramaEnabled={props.shortDramaEnabled} />
            ) : (
                <section className={`home-focus-grid${shouldShowTaskSection(props.taskCenterEnabled) ? "" : " is-single"}`} aria-label="继续创作与任务状态">
                    <RecentWorkSection activeProjects={activeProjects} canvases={independentCanvases} assets={sortedAssets} projectsState={props.projectsState} localDataHydrated={props.localDataHydrated} onRetryProjects={props.onRetryProjects} />
                    {shouldShowTaskSection(props.taskCenterEnabled) ? <TaskAttentionSection tasks={sortedTasks} state={props.tasksState} onRetry={props.onRetryTasks} /> : null}
                </section>
            )}

            <section className="home-stats" aria-label="工作台概览">
                {props.shortDramaEnabled ? (
                    <MetricCard
                        icon={<FolderKanban />}
                        label="进行中项目"
                        value={props.projectsState === "loading" || props.projectsState === "error" ? null : activeProjects.length}
                        detail={activeProjects.length ? `${totalUnits} 章 · ${archivedCount} 个已归档` : "暂无进行中的短剧项目"}
                        to="/projects"
                    />
                ) : null}
                <MetricCard icon={<LayoutGrid />} label="自由画布" value={props.localDataHydrated ? independentCanvases.length : null} detail={latestCanvasUpdate ? `${formatRelativeTime(latestCanvasUpdate)}更新` : "独立创作空间"} to="/canvas" />
                <MetricCard icon={<Images />} label="素材资产" value={props.localDataHydrated ? props.assets.length : null} detail={assetSummaryHint(assetKindCounts)} to="/assets" />
                {props.taskCenterEnabled ? (
                    <MetricCard
                        icon={<ListTodo />}
                        label="本周任务"
                        value={props.tasksState === "ready" ? weekStats.total : null}
                        detail={props.tasksState === "error" ? "任务数据暂不可用" : weekStats.total ? `成功 ${weekStats.succeeded} · 待处理 ${weekStats.attention}` : "本周暂无生成任务"}
                        to="/tasks"
                    />
                ) : null}
            </section>

            {hasActivityChart || props.assets.length ? (
                <section className={`home-insights${hasActivityChart && props.assets.length ? "" : " is-single"}`} aria-label="创作数据详情">
                    {hasActivityChart ? <ActivityPanel data={activityData} rangeDays={rangeDays} setRangeDays={setRangeDays} reducedMotion={reducedMotion} /> : null}
                    {props.assets.length ? <AssetPanel entries={assetChartEntries} total={props.assets.length} reducedMotion={reducedMotion} /> : null}
                </section>
            ) : null}
        </>
    );
}

function HeroVisual({ mode, activeProject, latestPreview, canvas, task }: { mode: ReturnType<typeof deriveHomeMode>; activeProject?: ProjectSummary; latestPreview?: string; canvas?: CanvasProject; task?: GenerationTask }) {
    const title = activeProject?.project.name || canvas?.title || taskTitle(task) || "你的下一幕，从这里开始";
    const meta = activeProject
        ? `${projectStyleTitle(activeProject.project)} · ${activeProject.project.aspectRatio}`
        : canvas
          ? `自由画布 · ${formatRelativeTime(canvas.updatedAt)}更新`
          : task
            ? taskStatusLabel(task.status)
            : "图片、视频与故事都可以成为起点";
    return (
        <div className={`home-hero-visual is-${mode}`} aria-label={activeProject || canvas || task ? `最近创作：${title}` : "创作预览"}>
            {latestPreview ? (
                <img src={latestPreview} alt="" />
            ) : (
                <span className="home-hero-visual__placeholder" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                </span>
            )}
            <span className="home-hero-visual__scrim" aria-hidden="true" />
            <span className="home-hero-visual__caption">
                <span>{activeProject ? "正在制作" : mode === "returning" ? "最近创作" : "创作场景"}</span>
                <strong>{title}</strong>
                <small>{meta}</small>
            </span>
        </div>
    );
}

function RecentWorkSection({
    activeProjects,
    canvases,
    assets,
    projectsState,
    localDataHydrated,
    onRetryProjects,
}: {
    activeProjects: ProjectSummary[];
    canvases: CanvasProject[];
    assets: Asset[];
    projectsState: HomeSectionState;
    localDataHydrated: boolean;
    onRetryProjects: () => void;
}) {
    const projectItems = activeProjects.slice(0, 3);
    const canvasItems = canvases.slice(0, Math.max(0, 3 - projectItems.length));
    const latestAsset = assets[0];
    const hasItems = projectItems.length + canvasItems.length > 0;
    return (
        <section className="home-panel home-recent" aria-labelledby="home-recent-title">
            <SectionHeading
                id="home-recent-title"
                title="最近创作"
                description="从上次停下的位置继续"
                action={
                    <Link to={activeProjects.length ? "/projects" : "/canvas"}>
                        查看全部
                        <ArrowRight />
                    </Link>
                }
            />
            {projectsState === "error" ? (
                <div className="home-inline-error" role="status">
                    <AlertTriangle aria-hidden="true" />
                    <span>
                        <strong>短剧项目暂时无法读取</strong>
                        <small>本地画布与创作入口仍可使用。</small>
                    </span>
                    <Button type="text" size="small" onClick={onRetryProjects}>
                        重试
                    </Button>
                </div>
            ) : null}
            {projectsState === "loading" || !localDataHydrated ? (
                <div className="home-card-skeletons" aria-label="正在读取最近创作">
                    <i />
                    <i />
                </div>
            ) : hasItems ? (
                <div className="home-work-cards">
                    {projectItems.map((row) => (
                        <ProjectWorkCard key={row.project.id} row={row} />
                    ))}
                    {canvasItems.map((canvas) => (
                        <CanvasWorkCard key={canvas.id} canvas={canvas} />
                    ))}
                </div>
            ) : latestAsset ? (
                <div className="home-work-cards">
                    <AssetWorkCard asset={latestAsset} />
                </div>
            ) : (
                <Link className="home-generic-continue" to="/create">
                    <Sparkles aria-hidden="true" />
                    <span>
                        <strong>继续快速创作</strong>
                        <small>输入一句描述，生成新的图片或视频</small>
                    </span>
                    <ArrowRight aria-hidden="true" />
                </Link>
            )}
        </section>
    );
}

function ProjectWorkCard({ row }: { row: ProjectSummary }) {
    const completion = projectSummaryCompletion(row);
    const cover = projectCoverUrl(row);
    return (
        <Link to={`/projects/${row.project.id}/overview`} className="home-work-card">
            <span className="home-work-card__media">
                {cover ? <img src={cover} alt="" /> : <FolderKanban aria-hidden="true" />}
                <i>{projectSummaryStage(row).label}</i>
            </span>
            <span className="home-work-card__body">
                <strong>{row.project.name}</strong>
                <small>
                    {projectStyleTitle(row.project)} · {row.unitCount} 章
                </small>
                <span className="home-work-card__progress">
                    <i>
                        <b style={{ width: `${completion}%` }} />
                    </i>
                    <em>{completion}%</em>
                </span>
            </span>
            <ArrowRight className="home-work-card__arrow" aria-hidden="true" />
        </Link>
    );
}

function CanvasWorkCard({ canvas }: { canvas: CanvasProject }) {
    return (
        <Link to={`/canvas/${canvas.id}`} className="home-work-card is-canvas">
            <span className="home-work-card__media">
                <LayoutGrid aria-hidden="true" />
                <i>自由画布</i>
            </span>
            <span className="home-work-card__body">
                <strong>{canvas.title}</strong>
                <small>
                    {canvas.nodes.length} 个节点 · {formatRelativeTime(canvas.updatedAt)}更新
                </small>
                <span className="home-work-card__note">继续整理画面与灵感</span>
            </span>
            <ArrowRight className="home-work-card__arrow" aria-hidden="true" />
        </Link>
    );
}

function AssetWorkCard({ asset }: { asset: Asset }) {
    return (
        <Link to="/assets" className="home-work-card">
            <span className="home-work-card__media">
                {asset.coverUrl ? <img src={asset.coverUrl} alt="" /> : <Images aria-hidden="true" />}
                <i>最近素材</i>
            </span>
            <span className="home-work-card__body">
                <strong>{asset.title}</strong>
                <small>
                    {assetKindLabel(asset.kind)} · {formatRelativeTime(asset.updatedAt)}更新
                </small>
                <span className="home-work-card__note">查看并整理素材</span>
            </span>
            <ArrowRight className="home-work-card__arrow" aria-hidden="true" />
        </Link>
    );
}

function TaskAttentionSection({ tasks, state, onRetry }: { tasks: GenerationTask[]; state: HomeSectionState; onRetry: () => void }) {
    const attentionTasks = tasks.filter((task) => task.status === "queued" || task.status === "running" || task.status === "failed" || task.status === "cancelled").slice(0, 4);
    return (
        <aside className="home-panel home-tasks" aria-labelledby="home-tasks-title">
            <SectionHeading
                id="home-tasks-title"
                title="任务状态"
                description="运行中与需要处理的结果"
                action={
                    <Link to="/tasks">
                        全部任务
                        <ArrowRight />
                    </Link>
                }
            />
            {state === "loading" ? (
                <div className="home-task-skeletons" aria-label="正在读取任务">
                    <i />
                    <i />
                    <i />
                </div>
            ) : state === "error" ? (
                <div className="home-task-empty is-error">
                    <AlertTriangle aria-hidden="true" />
                    <strong>任务状态暂不可用</strong>
                    <small>不会影响你继续发起创作。</small>
                    <Button size="small" onClick={onRetry}>
                        重新读取
                    </Button>
                </div>
            ) : attentionTasks.length ? (
                <ul className="home-task-list">
                    {attentionTasks.map((task) => (
                        <li key={task.id}>
                            <Link to="/tasks">
                                <span className={`home-task-status is-${task.status}`} aria-label={taskStatusLabel(task.status)} />
                                <span>
                                    <strong>{taskTitle(task)}</strong>
                                    <small>
                                        {taskStatusLabel(task.status)} · {formatRelativeTime(task.updatedAt)}
                                    </small>
                                </span>
                                {typeof task.progress === "number" && (task.status === "running" || task.status === "queued") ? <em>{Math.round(task.progress)}%</em> : <ArrowRight aria-hidden="true" />}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="home-task-empty">
                    <ListTodo aria-hidden="true" />
                    <strong>没有待处理任务</strong>
                    <small>新的生成任务会在这里显示进度。</small>
                </div>
            )}
        </aside>
    );
}

function OnboardingSection({ shortDramaEnabled }: { shortDramaEnabled: boolean }) {
    return (
        <section className="home-panel home-onboarding" aria-labelledby="home-onboarding-title">
            <SectionHeading id="home-onboarding-title" title="从想法到镜头" description={shortDramaEnabled ? "快速生成，也可以随时进入完整项目流程" : "从一句描述开始快速生成"} />
            <ol>
                {WORKFLOW.slice(0, shortDramaEnabled ? 4 : 2).map((step, index) => (
                    <li key={step.title}>
                        <span>0{index + 1}</span>
                        <strong>{step.title}</strong>
                        <small>{step.description}</small>
                    </li>
                ))}
            </ol>
        </section>
    );
}

function MetricCard({ icon, label, value, detail, to }: { icon: ReactNode; label: string; value: number | null; detail: string; to: string }) {
    return (
        <Link to={to} className="home-metric">
            <span className="home-metric__icon">{icon}</span>
            <span>
                <small>{label}</small>
                <strong aria-label={value === null ? `${label}正在读取` : `${label}${value}`}>{value ?? "—"}</strong>
                <em>{detail}</em>
            </span>
            <ArrowRight aria-hidden="true" />
        </Link>
    );
}

function ActivityPanel({ data, rangeDays, setRangeDays, reducedMotion }: { data: ActivityBucket[]; rangeDays: number; setRangeDays: (days: number) => void; reducedMotion: boolean }) {
    const totals = data.reduce((sum, item) => ({ tasks: sum.tasks + item.tasks, canvases: sum.canvases + item.canvases }), { tasks: 0, canvases: 0 });
    return (
        <section className="home-panel home-chart-panel" aria-labelledby="home-activity-title">
            <SectionHeading
                id="home-activity-title"
                title="创作活跃度"
                description={`近 ${rangeDays} 天 · ${totals.tasks} 个生成任务，${totals.canvases} 个画布最近更新`}
                action={
                    <div className="home-range-controls" aria-label="活跃度时间范围">
                        {[7, 14, 30].map((days) => (
                            <button type="button" key={days} aria-pressed={rangeDays === days} onClick={() => setRangeDays(days)}>
                                {days} 天
                            </button>
                        ))}
                    </div>
                }
            />
            <div className="home-chart" aria-hidden="true">
                <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={data} margin={{ top: 12, right: 4, left: -22, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--app-border-subtle)" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={rangeDays > 14 ? 4 : rangeDays > 7 ? 2 : 0} tick={{ fill: "var(--app-text-secondary)", fontSize: 11 }} />
                        <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "var(--app-text-secondary)", fontSize: 10 }} />
                        <ChartTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "var(--app-text-primary)", fontSize: 12 }} labelStyle={{ color: "var(--app-text-primary)", fontWeight: 600 }} />
                        <Bar dataKey="tasks" name="生成任务" fill={CHART_AI} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={!reducedMotion} />
                        <Bar dataKey="canvases" name="画布更新" fill={CHART_BRAND_MUTED} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={!reducedMotion} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <details className="home-chart-data">
                <summary>查看文字数据与统计口径</summary>
                <p>任务最多读取最近 300 条；画布按当前 updatedAt 归入日期，它表示最近更新时间，不是完整更新事件历史。</p>
                <ul>
                    {data
                        .filter((item) => item.tasks || item.canvases)
                        .map((item) => (
                            <li key={item.label}>
                                <time>{item.label}</time>
                                <span>生成任务 {item.tasks}</span>
                                <span>画布更新 {item.canvases}</span>
                            </li>
                        ))}
                </ul>
            </details>
        </section>
    );
}

function AssetPanel({ entries, total, reducedMotion }: { entries: AssetChartEntry[]; total: number; reducedMotion: boolean }) {
    return (
        <section className="home-panel home-chart-panel" aria-labelledby="home-assets-title">
            <SectionHeading id="home-assets-title" title="素材构成" description={`素材库共 ${total} 项`} />
            <div className="home-asset-chart">
                <div className="home-donut" aria-hidden="true">
                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie data={entries} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="88%" paddingAngle={2} cornerRadius={3} stroke="none" isAnimationActive={!reducedMotion}>
                                {entries.map((entry) => (
                                    <Cell key={entry.name} fill={entry.color} />
                                ))}
                            </Pie>
                            <ChartTooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "var(--app-text-primary)" }} />
                        </PieChart>
                    </ResponsiveContainer>
                    <span>
                        <strong>{total}</strong>
                        <small>项素材</small>
                    </span>
                </div>
                <ul aria-label="素材类型明细">
                    {entries.map((entry) => (
                        <li key={entry.name}>
                            <i style={{ background: entry.color }} />
                            <span>{entry.name}</span>
                            <strong>{entry.value}</strong>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

function SectionHeading({ id, title, description, action }: { id: string; title: string; description: string; action?: ReactNode }) {
    return (
        <header className="home-section-heading">
            <span>
                <h2 id={id}>{title}</h2>
                <p>{description}</p>
            </span>
            {action}
        </header>
    );
}

function getHeroCopy(mode: ReturnType<typeof deriveHomeMode>, activeProject: ProjectSummary | undefined, user: LocalUser | null, brandName: string, projectsState: HomeSectionState, tasksState: HomeSectionState) {
    const displayName = user?.displayName || user?.username || "创作者";
    if (mode === "project" && activeProject) return { title: activeProject.project.name, description: `${displayName}，继续把正在制作的内容推进到下一个可用镜头。`, status: "" };
    if (mode === "returning") {
        const restoring = projectsState === "loading" || tasksState === "loading";
        const degraded = projectsState === "error" || tasksState === "error";
        return { title: `继续创作，${displayName}`, description: "最近的画布、素材与生成结果都在这里，选择一个入口继续推进。", status: restoring ? "正在恢复部分创作记录…" : degraded ? "部分数据暂不可用，创作入口仍可正常使用" : `欢迎回到${brandName}` };
    }
    return { title: "把一个想法，变成可用的镜头", description: "输入一句描述即可生成图片或视频；需要完整制作时，可以创建短剧项目继续整理角色、场景与分镜。", status: "" };
}

function resolveLatestPreview(activeProject: ProjectSummary | undefined, assets: Asset[], tasks: GenerationTask[]) {
    const projectCover = activeProject ? projectCoverUrl(activeProject) : undefined;
    if (projectCover) return projectCover;
    const latestTaskPreview = tasks.find((task) => task.previewUrl && task.previewKind !== "video")?.previewUrl;
    return latestTaskPreview || assets.find((asset) => asset.coverUrl)?.coverUrl;
}

function projectCoverUrl(row: ProjectSummary) {
    return row.project.coverResourceId ? resourceFileUrl(row.project.coverResourceId) : resolveProjectCanvasStyle(row.project.stylePresetId, row.project.styleProfileJson)?.imageUrl;
}

function projectStyleTitle(project: ProjectSummary["project"]) {
    const projectStyle = resolveProjectCanvasStyle(project.stylePresetId, project.styleProfileJson);
    return projectStyle?.title || parseStyleProfile(project.styleProfileJson)?.title || resolveCanvasStylePreset(project.stylePresetId)?.title || (project.stylePresetId ? "自定义画风" : SOURCE_TYPE_LABELS[project.sourceType] || "未设置画风");
}

function taskTitle(task?: GenerationTask) {
    if (!task) return "";
    const prompt = task.prompt?.trim();
    if (prompt) return prompt.length > 30 ? `${prompt.slice(0, 30)}…` : prompt;
    if (task.type.includes("video")) return "视频生成";
    if (task.type.includes("image")) return "图片生成";
    return "生成任务";
}

function taskStatusLabel(status: GenerationTask["status"]) {
    if (status === "running") return "运行中";
    if (status === "queued") return "等待中";
    if (status === "succeeded") return "已完成";
    if (status === "cancelled") return "已取消";
    return "需要处理";
}

function buildWeekStats(tasks: GenerationTask[]) {
    const weekWindow = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekTasks = tasks.filter((task) => new Date(task.createdAt).getTime() >= weekWindow);
    return { total: weekTasks.length, succeeded: weekTasks.filter((task) => task.status === "succeeded").length, attention: weekTasks.filter((task) => task.status !== "succeeded").length };
}

function countAssetKinds(assets: Asset[]) {
    const counts: Partial<Record<AssetKind, number>> = {};
    for (const asset of assets) counts[asset.kind] = (counts[asset.kind] || 0) + 1;
    return counts;
}

function assetKindLabel(kind: AssetKind) {
    return ASSET_KINDS.find((item) => item.key === kind)?.label || "素材";
}

function assetSummaryHint(counts: Partial<Record<AssetKind, number>>) {
    const parts = ASSET_KINDS.map(({ key, label }) => ({ label, count: counts[key] || 0 })).filter(({ count }) => count > 0);
    return parts.length
        ? parts
              .slice(0, 3)
              .map(({ label, count }) => `${label} ${count}`)
              .join(" · ")
        : "从创作中沉淀素材";
}

type ActivityBucket = { label: string; tasks: number; canvases: number };

function buildActivityBuckets(days: number, taskDates: number[], canvasDates: number[]): ActivityBucket[] {
    const buckets: ActivityBucket[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const day = new Date(today);
        day.setDate(today.getDate() - offset);
        const start = day.getTime();
        const end = start + 24 * 60 * 60 * 1000;
        buckets.push({ label: `${day.getMonth() + 1}/${day.getDate()}`, tasks: taskDates.filter((time) => time >= start && time < end).length, canvases: canvasDates.filter((time) => time >= start && time < end).length });
    }
    return buckets;
}

type AssetChartEntry = { name: string; value: number; color: string };

function assetChartData(assets: Asset[]): AssetChartEntry[] {
    const colors = [
        CHART_BRAND,
        "color-mix(in srgb, var(--home-chart-brand, var(--app-action-primary-bg)) 68%, transparent)",
        "color-mix(in srgb, var(--home-chart-brand, var(--app-action-primary-bg)) 50%, transparent)",
        "color-mix(in srgb, var(--home-chart-brand, var(--app-action-primary-bg)) 34%, transparent)",
        "color-mix(in srgb, var(--home-chart-brand, var(--app-action-primary-bg)) 22%, transparent)",
    ];
    const counts = countAssetKinds(assets);
    return ASSET_KINDS.filter(({ key }) => (counts[key] || 0) > 0).map(({ key, label }, index) => ({ name: label, value: counts[key] || 0, color: colors[index % colors.length] }));
}

function formatRelativeTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "最近";
    const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
    const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
    if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
    const diffDays = Math.round(diffHours / 24);
    if (Math.abs(diffDays) < 30) return formatter.format(diffDays, "day");
    return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    return reduced;
}

const TOOLTIP_STYLE = { background: "var(--app-surface-overlay)", border: "1px solid var(--app-border-default)", borderRadius: "var(--app-control-radius)", boxShadow: "var(--app-shadow-overlay)", fontSize: 12 };
