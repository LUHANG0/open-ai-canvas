import { useEffect, useRef, useState } from "react";
import { App, Button, Progress } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { saveAs } from "file-saver";
import { CheckCircle2, CircleAlert, Clock3, Download, Film, Layers3, PackageCheck } from "lucide-react";
import { Link } from "react-router";

import { Surface } from "@/components/ui/pc";
import { projectSourceTextToPlainText } from "@/lib/project-source-text";
import { createProjectDeliveryJob, getLatestProjectDeliveryJob, listProjectAssetsPage, projectDeliveryJobFileUrl, type ProjectDeliveryJob, type ProjectDetail } from "@/services/api/projects";

import { createProjectDeliveryArchive, type ProjectDeliveryExportProgress } from "./project-delivery-export";
import { planProjectDelivery } from "./project-delivery";
import { assetCategoryLabel, formatDuration, MetricCard, StageHeading } from "./workflow-shared";

export function StoryStage({ detail, projectId, unitId }: { detail: ProjectDetail; projectId: string; unitId: string }) {
    const unit = detail.units.find((item) => item.id === unitId)!;
    const sourceText = projectSourceTextToPlainText(unit.sourceText);
    return (
        <section className="workflow-stage-overview is-story mx-auto max-w-5xl">
            <StageHeading eyebrow="01 / 剧情与章节" title={unit.title} description="章节原文是资产拆分、分镜版本和生成提示的唯一来源。" />
            <Surface className="workflow-story-source mt-6" padding="lg">
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground/55">章节原文</span>
                    <Link to={`/projects/${projectId}/chapters/${unit.id}`}>
                        <Button size="small">编辑章节</Button>
                    </Link>
                </div>
                <div className="max-h-[60vh] whitespace-pre-wrap text-sm leading-7 text-foreground/78">{sourceText || "当前章节还没有正文。请先在剧情章节中上传小说或添加内容。"}</div>
            </Surface>
        </section>
    );
}

export function AssetsStage({ detail, projectId, unitId }: { detail: ProjectDetail; projectId: string; unitId: string }) {
    const candidates = detail.assetCandidates.filter((item) => !item.unitId || item.unitId === unitId);
    const assetCountsQuery = useQuery({ queryKey: ["project", projectId, "assets", "workflow-counts"], queryFn: () => listProjectAssetsPage(projectId, { page: 1, pageSize: 1 }) });
    const confirmedCounts = assetCountsQuery.data?.categoryCounts || {};
    const categories = ["character", "environment", "wardrobe", "prop", "weapon"];
    return (
        <section className="workflow-stage-overview is-assets mx-auto max-w-6xl">
            <StageHeading eyebrow="02 / 资产拆分" title="确认镜头真正会使用的资产" description="角色、场景、服饰、配饰与武器先建立稳定版本，镜头再绑定具体版本。" />
            <div className="workflow-assets-metrics mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {categories.map((category) => {
                    const confirmed = confirmedCounts[category] || 0;
                    const pending = candidates.filter((item) => item.category === category && item.status === "pending_confirmation").length;
                    return (
                        <Surface key={category} className="workflow-assets-metric" padding="md">
                            <div className="text-xs font-medium text-foreground/55">{assetCategoryLabel(category)}</div>
                            <div className="mt-3 text-2xl font-semibold">{assetCountsQuery.isLoading ? "—" : confirmed}</div>
                            <div className="mt-1 text-[var(--fs-micro)] text-foreground/42">已确认 · {pending} 待处理</div>
                        </Surface>
                    );
                })}
            </div>
            <Surface className="workflow-assets-callout mt-5 flex items-center justify-between" padding="lg">
                <div>
                    <h3 className="text-sm font-semibold">资产库承担版本确认与设定维护</h3>
                    <p className="mt-1 text-xs text-foreground/48">确认后可直接在分镜工作台左栏绑定到镜头。</p>
                </div>
                <Link to={`/projects/${projectId}/assets`}>
                    <Button type="primary">打开资产库</Button>
                </Link>
            </Surface>
        </section>
    );
}

export function DeliveryStage({ detail, unitId, enableServerDelivery = true }: { detail: ProjectDetail; unitId: string; enableServerDelivery?: boolean }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [localExporting, setLocalExporting] = useState(false);
    const [serverSubmitting, setServerSubmitting] = useState(false);
    const [localProgress, setLocalProgress] = useState<ProjectDeliveryExportProgress>();
    const localController = useRef<AbortController | null>(null);
    useEffect(() => () => localController.current?.abort(), [detail.project.id, unitId]);
    const plan = planProjectDelivery(detail, unitId);
    const readyVideoCount = plan.shots.length - plan.missingShots.length;
    const unavailableLabel = plan.shots.length === 0 ? "先完成分镜与视频" : plan.missingShots.length > 0 ? `还差 ${plan.missingShots.length} 个镜头视频` : "";
    const deliveryQueryKey = ["project", detail.project.id, "unit", unitId, "delivery-job"] as const;
    const deliveryQuery = useQuery({
        queryKey: deliveryQueryKey,
        queryFn: () => getLatestProjectDeliveryJob(detail.project.id, unitId),
        enabled: enableServerDelivery && Boolean(detail.project.id && unitId),
        refetchInterval: (query) => {
            const currentJob = query.state.data?.job;
            const status = currentJob?.status;
            if (status === "queued" || status === "running") return 2_000;
            if (currentJob?.status === "succeeded" && currentJob.expiresAt) {
                const remainingMs = Date.parse(currentJob.expiresAt) - Date.now();
                return remainingMs > 0 ? remainingMs + 1_000 : false;
            }
            return false;
        },
    });
    const job = deliveryQuery.data?.job;
    const serverActive = job?.status === "queued" || job?.status === "running";
    const serverExpired = job?.status === "expired" || (job?.status === "succeeded" && Boolean(job.expiresAt) && Date.parse(job.expiresAt || "") <= Date.now());
    const startServerDelivery = async () => {
        if (!plan.ready || serverSubmitting || serverActive) return;
        setServerSubmitting(true);
        try {
            const result = await createProjectDeliveryJob(detail.project.id, unitId);
            queryClient.setQueryData<{ job: ProjectDeliveryJob | null }>(deliveryQueryKey, result);
            message.success("交付任务已提交，可离开页面等待后台完成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "后台交付任务提交失败");
        } finally {
            setServerSubmitting(false);
        }
    };
    const downloadServerDelivery = () => {
        if (!job?.resourceId) return;
        const link = document.createElement("a");
        link.href = projectDeliveryJobFileUrl(detail.project.id, unitId, job.id);
        link.download = job.fileName || `${plan.fileBaseName}-交付包.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        message.success("交付包已开始下载");
    };
    const exportDeliveryLocally = async () => {
        if (!plan.ready || localController.current) return;
        const controller = new AbortController();
        localController.current = controller;
        setLocalExporting(true);
        setLocalProgress({ phase: "checking", progress: 0, message: "正在核对镜头容量" });
        try {
            const result = await createProjectDeliveryArchive(detail, unitId, setLocalProgress, { signal: controller.signal });
            controller.signal.throwIfAborted();
            saveAs(result.archive, result.fileName);
            message.success("交付包已生成并开始下载");
        } catch (error) {
            setLocalProgress(undefined);
            if (controller.signal.aborted) message.info("本机生成已取消");
            else message.error(error instanceof Error ? error.message : "交付包生成失败");
        } finally {
            localController.current = null;
            setLocalExporting(false);
        }
    };
    const serverButton = !enableServerDelivery ? null : job?.status === "succeeded" && job.resourceId && !serverExpired ? (
        <Button type="primary" icon={<Download className="size-4" />} onClick={downloadServerDelivery}>
            下载后台交付包
        </Button>
    ) : (
        <Button type="primary" disabled={!plan.ready || serverActive} loading={serverSubmitting || serverActive} onClick={() => void startServerDelivery()}>
            {unavailableLabel || (serverActive ? job?.stage || "后台生成中" : job?.status === "failed" || serverExpired ? "重新后台生成" : "后台生成交付包")}
        </Button>
    );
    return (
        <section className="workflow-stage-overview is-delivery mx-auto max-w-5xl">
            <StageHeading eyebrow="06 / 交付与打包" title="交付前质量门禁" description="所有镜头都有已选中的可用视频后，可交给服务器后台打包；关闭页面也会继续。" />
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <MetricCard icon={<Film className="size-5" />} label="视频已就绪" value={`${readyVideoCount} / ${plan.shots.length}`} />
                <MetricCard icon={<Clock3 className="size-5" />} label="总时长" value={formatDuration(plan.totalDurationMs)} />
                <MetricCard icon={<Layers3 className="size-5" />} label="历史过期产物" value={String(plan.staleArtifactCount)} />
            </div>
            <div className={`workflow-delivery-readiness mt-5 ${plan.ready ? "is-ready" : "is-blocked"}`} role="status">
                <span className="workflow-delivery-readiness-icon">{plan.ready ? <CheckCircle2 aria-hidden /> : <CircleAlert aria-hidden />}</span>
                <div className="workflow-delivery-readiness-copy">
                    <strong>{plan.ready ? "质量门禁已通过" : plan.shots.length ? `还有 ${plan.missingShots.length} 个镜头未就绪` : "等待分镜视频"}</strong>
                    <p>{plan.ready ? "镜头顺序、选中视频和时长已核对，可以生成交付包。" : plan.shots.length ? "只会使用每个镜头当前选中的可用视频；补齐后即可在本页直接交付。" : "先在视频生成阶段创建镜头并完成可用视频。"}</p>
                </div>
                {plan.missingShots.length ? (
                    <div className="workflow-delivery-missing-shots" aria-label="未就绪镜头">
                        {plan.missingShots.slice(0, 5).map((shot, index) => (
                            <span key={shot.id}>
                                SC.{String(plan.shots.findIndex((item) => item.shot.id === shot.id) + 1).padStart(2, "0")} · {shot.title}
                            </span>
                        ))}
                        {plan.missingShots.length > 5 ? <span>另有 {plan.missingShots.length - 5} 镜</span> : null}
                    </div>
                ) : null}
            </div>
            <Surface className="workflow-delivery-plan mt-5" padding="lg">
                <div className="workflow-delivery-plan-heading">
                    <PackageCheck className="workflow-delivery-plan-icon" />
                    <div>
                        <h3>交付包内容</h3>
                        <p>成片 MP4、字幕 SRT、分镜 JSON/CSV、资产清单和生成参数 ZIP。后台模式不会占用当前浏览器，完成后保留 7 天；本机模式仍可作为服务器组件不可用时的备用方案。旧的过期产物仅作历史提示，不阻断新版本交付。</p>
                    </div>
                </div>
                <div className="workflow-delivery-actions">
                    <div className="workflow-delivery-actions-primary">
                        <span>推荐</span>
                        {serverButton}
                        {enableServerDelivery && job?.status === "succeeded" && !serverExpired ? (
                            <Button disabled={!plan.ready} loading={serverSubmitting} onClick={() => void startServerDelivery()}>
                                后台重新生成
                            </Button>
                        ) : null}
                    </div>
                    <div className="workflow-delivery-actions-fallback">
                        <span>备用</span>
                        <Button data-testid="project-delivery-local-export" icon={<Download className="size-4" />} disabled={!plan.ready || serverActive} loading={localExporting} onClick={() => void exportDeliveryLocally()}>
                            {unavailableLabel || "本机直接生成"}
                        </Button>
                        {localExporting ? <Button data-testid="project-delivery-local-cancel" onClick={() => localController.current?.abort()}>取消本机生成</Button> : null}
                    </div>
                </div>
                <div className="workflow-delivery-job-status" aria-live="polite">
                    {enableServerDelivery && deliveryQuery.isLoading ? <p>正在读取最近一次后台交付任务…</p> : null}
                    {enableServerDelivery && deliveryQuery.isError ? <p className="is-error">后台交付状态暂时无法读取，可稍后重试或使用本机模式。</p> : null}
                    {serverActive ? (
                        <div>
                            <Progress percent={job?.progress || 0} showInfo={false} size="small" />
                            <p>{job?.stage || "后台生成中"}，可以离开本页</p>
                        </div>
                    ) : null}
                    {job?.status === "succeeded" && !serverExpired ? <p>后台交付包已就绪{job.expiresAt ? `，有效期至 ${new Date(job.expiresAt).toLocaleString()}` : ""}。</p> : null}
                    {job?.status === "failed" ? <p className="is-error">{job.error || "后台交付包生成失败，可重新生成或改用本机模式。"}</p> : null}
                    {serverExpired ? <p>上一份后台交付包已过期，请重新生成。</p> : null}
                    {localProgress ? (
                        <div data-delivery-local-progress>
                            <Progress percent={localProgress.progress} showInfo={false} size="small" />
                            <p>{localProgress.message}</p>
                        </div>
                    ) : null}
                </div>
            </Surface>
        </section>
    );
}
