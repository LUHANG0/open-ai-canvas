import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "antd";
import { Link, useNavigate } from "react-router";

import { WorkspaceState } from "@/components/ui/pc/workspace-state";
import type { ProjectStageCell, ProjectWorkbenchAction } from "@/lib/project-workbench";
import type { ProjectOverview, ProjectOverviewMetrics } from "@/services/api/projects";

import { formatTime, type ProjectDetailViewProps } from "./shared";

export default function ProjectOverviewView({ detail, overview }: ProjectDetailViewProps & { overview: ProjectOverview }) {
    const navigate = useNavigate();
    const { project } = detail;
    const metrics = overview.metrics;
    const completedUnits = metrics.completedUnitCount;
    const attentionCount = metrics.pendingCandidateCount + metrics.staleArtifactCount;
    const completion = metrics.unitCount ? Math.round((completedUnits / metrics.unitCount) * 100) : 0;
    const firstUnitId = detail.units.slice().sort((left, right) => left.position - right.position)[0]?.id || overview.units[0]?.unit.id;
    const workflowHref = (targetStage: string) => firstUnitId ? `/projects/${project.id}/workflow/${firstUnitId}/${targetStage}` : `/projects/${project.id}/chapters`;
    const stage = overviewStage(metrics);
    const primaryAction = overviewActions(project.id, metrics, firstUnitId)[0];
    const unitStages = overview.units.map((item) => ({
        unit: item.unit,
        content: stageCell(item.unit.wordCount > 0, item.unit.wordCount > 0 ? `${formatCompactCount(item.unit.wordCount)} 字` : "待补充"),
        assets: stageCell(item.candidateCount === 0 && item.shotCount > 0, item.candidateCount ? `${item.candidateCount} 待确认` : item.shotCount ? "已确认" : "待拆分", item.candidateCount > 0),
        storyboard: stageCell(item.shotCount > 0, item.shotCount ? `${item.shotCount} 镜` : "待生成"),
        canvas: stageCell(item.canvasCount > 0, item.canvasCount ? `${item.canvasCount} 张` : "未关联"),
    }));
    const productionSteps = [
        { id: "story", label: "剧情章节", metric: `${metrics.unitCount} 章`, href: `/projects/${project.id}/chapters`, complete: metrics.unitCount > 0 },
        { id: "assets", label: "角色资产", metric: `${metrics.assetCount} 项`, href: `/projects/${project.id}/assets`, complete: metrics.assetCount > 0 },
        { id: "storyboard", label: "分镜画面", metric: `${metrics.readyStoryboardCount}/${metrics.shotCount || 0}`, href: workflowHref("storyboard"), complete: metrics.shotCount > 0 },
        { id: "previz", label: "动作预演", metric: `${metrics.readyPrevizCount}/${metrics.shotCount || 0}`, href: workflowHref("previz"), complete: metrics.shotCount > 0 && metrics.readyPrevizCount === metrics.shotCount },
        { id: "video", label: "镜头视频", metric: `${metrics.readyVideoCount}/${metrics.shotCount || 0}`, href: workflowHref("video"), complete: metrics.shotCount > 0 && metrics.readyVideoCount === metrics.shotCount },
        { id: "delivery", label: "交付打包", metric: metrics.readyVideoCount && metrics.readyVideoCount === metrics.shotCount ? "就绪" : `差 ${Math.max(0, metrics.shotCount - metrics.readyVideoCount)}`, href: workflowHref("delivery"), complete: metrics.shotCount > 0 && metrics.readyVideoCount === metrics.shotCount },
    ];

    return (
        <div className="pc-project-overview space-y-8">
            <section className="project-overview-focus">
                <div className="grid lg:grid-cols-[minmax(0,1fr)_308px]">
                    <div className="project-overview-primary">
                        <div className="project-overview-eyebrow">
                            <span>当前任务</span>
                            <span className="project-overview-eyebrow-divider" aria-hidden>/</span>
                            <span className="project-overview-eyebrow-stage">{stage.label}</span>
                            {attentionCount ? <span className="project-overview-eyebrow-badge">{attentionCount} 项待处理</span> : null}
                        </div>
                        <h2 className="project-overview-title">{primaryAction.title}</h2>
                        <p className="project-overview-description">{primaryAction.description}</p>
                        <div className="project-overview-cta">
                            <Button type="primary" onClick={() => navigate(primaryAction.href)} className="project-overview-cta-primary">
                                <span className="truncate">{primaryAction.actionLabel}</span><ArrowRight className="size-4 shrink-0" />
                            </Button>
                        </div>
                    </div>

                    <aside className="project-overview-status" aria-label="项目进度">
                        <div className="project-overview-progress">
                            <div className="project-overview-progress-head">
                                <span className="project-overview-status-label">章节进度</span>
                                <span className="project-overview-progress-percent">{completion}%</span>
                            </div>
                            <div className="project-overview-progress-count">{completedUnits}<span>/ {metrics.unitCount}</span></div>
                            <div className="project-overview-progress-track pc-project-overview-progress-legacy" aria-hidden="true"><div style={{ width: `${completion}%` }} /></div>
                            <progress className="project-overview-progress-track pc-project-overview-progress-pc" max={100} value={completion} aria-label={`章节完成度 ${completion}%`} />
                        </div>
                        <dl className="project-overview-facts">
                            <ProjectFact label="当前阶段" value={stage.label} />
                            <ProjectFact label="分镜镜头" value={`${metrics.shotCount} 个`} />
                            <ProjectFact label="项目画布" value={`${metrics.canvasCount} 张`} />
                            <ProjectFact label="需要处理" value={`${attentionCount} 项`} attention={attentionCount > 0} />
                        </dl>
                    </aside>
                </div>
            </section>

            <section className="project-standard-flow is-compact">
                <div className="project-standard-flow-head"><div><span>制作流程</span><h2>从故事到交付</h2></div><Link to={primaryAction.href}>继续当前任务<ArrowRight /></Link></div>
                <div className="project-standard-flow-track is-compact">
                    {productionSteps.map((step, index) => <Link key={step.id} to={step.href} className={step.complete ? "is-complete" : ""}><span className="project-standard-flow-index">{step.complete ? <CheckCircle2 /> : index + 1}</span><span><strong>{step.label}</strong><em>{step.metric}</em></span><ArrowRight className="project-standard-flow-arrow" /></Link>)}
                </div>
            </section>

            <section>
                <div className="project-pipeline-head">
                    <div className="min-w-0">
                        <h2 className="project-pipeline-title">章节进度</h2>
                        <p className="project-pipeline-hint">从内容确认到项目画布，每章只显示当前真实状态。</p>
                    </div>
                    <Link to={`/projects/${project.id}/chapters`} className="project-pipeline-more">查看全部章节<ArrowRight className="size-3.5" /></Link>
                </div>

                {unitStages.length ? (
                    <div className="project-pipeline-surface">
                        {unitStages.map((item) => (
                            <Link key={item.unit.id} to={`/projects/${project.id}/chapters/${item.unit.id}`} className="project-pipeline-row group">
                                <span className="project-pipeline-chapter">
                                    <span className="project-pipeline-index">{String(item.unit.position + 1).padStart(2, "0")}</span>
                                    <span className="min-w-0"><span className="project-pipeline-chapter-title">{item.unit.title}</span><span className="project-pipeline-chapter-time">更新于 {formatTime(item.unit.updatedAt)}</span></span>
                                </span>
                                <StagePipeline content={item.content} assets={item.assets} storyboard={item.storyboard} canvas={item.canvas} />
                                <ArrowRight className="project-pipeline-arrow size-4" />
                            </Link>
                        ))}
                    </div>
                ) : <div className="project-pipeline-surface p-2"><WorkspaceState icon="projects" compact title="还没有剧情章节" description="添加章节后，这里会显示内容、资产、分镜和画布的制作进度。" /></div>}
            </section>
        </div>
    );
}

function formatCompactCount(value: number) {
    return value >= 10_000 ? `${Math.round(value / 1_000) / 10} 万` : value.toLocaleString("zh-CN");
}

function ProjectFact({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
    return <div className="min-w-0"><dt>{label}</dt><dd className={attention ? "is-attention" : ""}>{value}</dd></div>;
}

function StagePipeline({ content, assets, storyboard, canvas }: { content: ProjectStageCell; assets: ProjectStageCell; storyboard: ProjectStageCell; canvas: ProjectStageCell }) {
    const stages = [{ label: "内容", cell: content }, { label: "资产", cell: assets }, { label: "分镜", cell: storyboard }, { label: "画布", cell: canvas }];
    return (
        <span className="project-pipeline-stages">
            {stages.map(({ label, cell }) => <StageStep key={label} label={label} cell={cell} />)}
        </span>
    );
}

function StageStep({ label, cell }: { label: string; cell: ProjectStageCell }) {
    return (
        <span className={`project-pipeline-stage is-${cell.state}`}>
            <span className="project-pipeline-stage-label">{label}</span>
            <span className="project-pipeline-stage-track" />
            <span className="project-pipeline-stage-value">{cell.label}</span>
        </span>
    );
}

function overviewStage(metrics: ProjectOverviewMetrics) {
    if (!metrics.unitCount) return { label: "准备故事", detail: "添加或导入剧情章节" };
    if (metrics.pendingCandidateCount) return { label: "资产确认", detail: `${metrics.pendingCandidateCount} 项待确认` };
    if (!metrics.shotCount || metrics.unitsWithoutShots) return { label: "分镜准备", detail: `${metrics.unitsWithoutShots || metrics.unitCount} 章待生成分镜` };
    if (metrics.readyVideoCount < metrics.shotCount) return { label: "镜头制作", detail: `${metrics.readyVideoCount}/${metrics.shotCount} 镜视频就绪` };
    return { label: "检查交付", detail: "镜头视频已准备完成" };
}

function overviewActions(projectId: string, metrics: ProjectOverviewMetrics, firstUnitId?: string): ProjectWorkbenchAction[] {
    const projectRoot = `/projects/${projectId}`;
    const workflowHref = firstUnitId ? `${projectRoot}/workflow/${firstUnitId}/video` : `${projectRoot}/chapters`;
    if (!metrics.unitCount) {
        return [{ id: "add-story", title: "添加第一个剧情章节", description: "导入小说、粘贴文本，或从空白章节开始。", href: `${projectRoot}/chapters`, actionLabel: "添加章节", tone: "default" }];
    }
    const actions: ProjectWorkbenchAction[] = [];
    if (metrics.unitsWithoutText) {
        actions.push({ id: "complete-story", title: `补充 ${metrics.unitsWithoutText} 章正文`, description: "先完善章节内容，后续角色识别与分镜拆分才能获得稳定输入。", href: `${projectRoot}/chapters`, actionLabel: "整理章节", tone: "attention" });
    }
    if (metrics.pendingCandidateCount) {
        actions.push({ id: "confirm-assets", title: `确认 ${metrics.pendingCandidateCount} 个资产候选`, description: "确认角色、场景与道具后，镜头可以稳定引用项目资产。", href: `${projectRoot}/assets`, actionLabel: "去确认", tone: "attention" });
    }
    if (!metrics.shotCount || metrics.unitsWithoutShots) {
        actions.push({ id: "create-storyboards", title: `为 ${metrics.unitsWithoutShots || metrics.unitCount} 章建立分镜`, description: "按章节生成镜头草稿，再逐镜调整画面、对白和时长。", href: firstUnitId ? `${projectRoot}/chapters/${firstUnitId}` : `${projectRoot}/chapters`, actionLabel: "建立分镜", tone: "default" });
    }
    if (metrics.shotCount && metrics.readyVideoCount < metrics.shotCount) {
        actions.push({ id: "continue-video", title: `继续制作 ${metrics.shotCount - metrics.readyVideoCount} 个镜头视频`, description: "检查镜头提示词与参考资产，逐镜生成并选择最终版本。", href: workflowHref, actionLabel: "继续制作", tone: metrics.staleArtifactCount ? "attention" : "default" });
    }
    if (!metrics.canvasCount) {
        actions.push({ id: "create-canvas", title: "建立第一张项目画布", description: "把章节、分镜和参考资产放进同一个制作空间。", href: `${projectRoot}/canvases`, actionLabel: "查看画布", tone: "default" });
    }
    if (!actions.length) {
        actions.push({ id: "review-delivery", title: "检查镜头并准备交付", description: "所有镜头视频已就绪，可检查版本、连续性和缺失项。", href: workflowHref, actionLabel: "检查交付", tone: "default" });
    }
    return actions;
}

function stageCell(complete: boolean, label: string, attention = false): ProjectStageCell {
    return { label, state: attention ? "attention" : complete ? "completed" : "idle" };
}
