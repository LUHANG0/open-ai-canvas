import { useState } from "react";
import { App, Button, Progress } from "antd";
import { useQuery } from "@tanstack/react-query";
import { saveAs } from "file-saver";
import { Clock3, Download, Film, Layers3, PackageCheck } from "lucide-react";
import { Link } from "react-router";

import { Surface } from "@/components/ui/pc";
import { projectSourceTextToPlainText } from "@/lib/project-source-text";
import { listProjectAssetsPage, type ProjectDetail } from "@/services/api/projects";

import { createProjectDeliveryArchive, type ProjectDeliveryExportProgress } from "./project-delivery-export";
import { planProjectDelivery } from "./project-delivery";
import { assetCategoryLabel, formatDuration, MetricCard, StageHeading } from "./workflow-shared";

export function StoryStage({ detail, projectId, unitId }: { detail: ProjectDetail; projectId: string; unitId: string }) {
    const unit = detail.units.find((item) => item.id === unitId)!;
    const sourceText = projectSourceTextToPlainText(unit.sourceText);
    return <section className="workflow-stage-overview is-story mx-auto max-w-5xl"><StageHeading eyebrow="01 / 剧情与章节" title={unit.title} description="章节原文是资产拆分、分镜版本和生成提示的唯一来源。" /><Surface className="workflow-story-source mt-6" padding="lg"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-foreground/55">章节原文</span><Link to={`/projects/${projectId}/chapters/${unit.id}`}><Button size="small">编辑章节</Button></Link></div><div className="max-h-[60vh] whitespace-pre-wrap text-sm leading-7 text-foreground/78">{sourceText || "当前章节还没有正文。请先在剧情章节中上传小说或添加内容。"}</div></Surface></section>;
}

export function AssetsStage({ detail, projectId, unitId }: { detail: ProjectDetail; projectId: string; unitId: string }) {
    const candidates = detail.assetCandidates.filter((item) => !item.unitId || item.unitId === unitId);
    const assetCountsQuery = useQuery({ queryKey: ["project", projectId, "assets", "workflow-counts"], queryFn: () => listProjectAssetsPage(projectId, { page: 1, pageSize: 1 }) });
    const confirmedCounts = assetCountsQuery.data?.categoryCounts || {};
    const categories = ["character", "environment", "wardrobe", "prop", "weapon"];
    return <section className="workflow-stage-overview is-assets mx-auto max-w-6xl"><StageHeading eyebrow="02 / 资产拆分" title="确认镜头真正会使用的资产" description="角色、场景、服饰、配饰与武器先建立稳定版本，镜头再绑定具体版本。" /><div className="workflow-assets-metrics mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{categories.map((category) => { const confirmed = confirmedCounts[category] || 0; const pending = candidates.filter((item) => item.category === category && item.status === "pending_confirmation").length; return <Surface key={category} className="workflow-assets-metric" padding="md"><div className="text-xs font-medium text-foreground/55">{assetCategoryLabel(category)}</div><div className="mt-3 text-2xl font-semibold">{assetCountsQuery.isLoading ? "—" : confirmed}</div><div className="mt-1 text-[var(--fs-micro)] text-foreground/42">已确认 · {pending} 待处理</div></Surface>; })}</div><Surface className="workflow-assets-callout mt-5 flex items-center justify-between" padding="lg"><div><h3 className="text-sm font-semibold">资产库承担版本确认与设定维护</h3><p className="mt-1 text-xs text-foreground/48">确认后可直接在分镜工作台左栏绑定到镜头。</p></div><Link to={`/projects/${projectId}/assets`}><Button type="primary">打开资产库</Button></Link></Surface></section>;
}

export function DeliveryStage({ detail, unitId }: { detail: ProjectDetail; unitId: string }) {
    const { message } = App.useApp();
    const [exporting, setExporting] = useState(false);
    const [progress, setProgress] = useState<ProjectDeliveryExportProgress>();
    const plan = planProjectDelivery(detail, unitId);
    const readyVideoCount = plan.shots.length - plan.missingShots.length;
    const buttonLabel = plan.shots.length === 0
        ? "先完成分镜与视频"
        : plan.missingShots.length > 0
            ? `还差 ${plan.missingShots.length} 个镜头视频`
            : "在本机生成交付包";
    const exportDelivery = async () => {
        if (!plan.ready || exporting) return;
        setExporting(true);
        setProgress({ phase: "checking", progress: 0, message: "正在核对镜头容量" });
        try {
            const result = await createProjectDeliveryArchive(detail, unitId, setProgress);
            saveAs(result.archive, result.fileName);
            message.success("交付包已生成并开始下载");
        } catch (error) {
            setProgress(undefined);
            message.error(error instanceof Error ? error.message : "交付包生成失败");
        } finally {
            setExporting(false);
        }
    };
    return <section className="workflow-stage-overview is-delivery mx-auto max-w-5xl"><StageHeading eyebrow="06 / 交付与打包" title="交付前质量门禁" description="所有镜头都有已选中的可用视频后，即可在本机打包成片与生产资料。" /><div className="mt-6 grid gap-4 sm:grid-cols-3"><MetricCard icon={<Film className="size-5" />} label="视频已就绪" value={`${readyVideoCount} / ${plan.shots.length}`} /><MetricCard icon={<Clock3 className="size-5" />} label="总时长" value={formatDuration(plan.totalDurationMs)} /><MetricCard icon={<Layers3 className="size-5" />} label="历史过期产物" value={String(plan.staleArtifactCount)} /></div><Surface className="workflow-delivery-plan mt-5" padding="lg"><div className="flex items-start gap-3"><PackageCheck className="mt-0.5 size-5 text-[var(--workspace-accent)]" /><div><h3 className="text-sm font-semibold">交付包内容</h3><p className="mt-1 text-xs leading-5 text-foreground/48">成片 MP4、字幕 SRT、分镜 JSON/CSV、资产清单和生成参数 ZIP。视频合成与打包全部在当前浏览器完成，不额外上传素材；导出前会核对视频容量，超出本机安全上限时会在合成前停止。旧的过期产物仅作历史提示，不阻断新版本交付。</p></div></div><Button className="mt-5" type="primary" icon={<Download className="size-4" />} disabled={!plan.ready} loading={exporting} onClick={() => void exportDelivery()}>{exporting ? "正在生成交付包" : buttonLabel}</Button>{progress ? <div className="mt-4 max-w-md" aria-live="polite"><Progress percent={progress.progress} showInfo={false} size="small" /><p className="mt-1 text-xs text-foreground/48">{progress.message}</p></div> : null}</Surface></section>;
}
