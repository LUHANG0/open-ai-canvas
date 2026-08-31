import type { ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { Link } from "react-router";

import { SectionHeader, StatTile, StatusBadge } from "@/components/ui/pc";
import type { ProjectDetail, ProjectShot, ShotArtifact, ShotRevision, WorkflowStep } from "@/services/api/projects";
import type { TaskStatus } from "@/services/api/task-center";

export type ShortDramaWorkflowStage = "story" | "assets" | "storyboard" | "previz" | "video" | "delivery";

export const workflowStages: Array<{ key: ShortDramaWorkflowStage; label: string; shortLabel: string }> = [
    { key: "story", label: "剧情与章节", shortLabel: "剧情" },
    { key: "assets", label: "资产拆分", shortLabel: "资产" },
    { key: "storyboard", label: "分镜脚本", shortLabel: "分镜" },
    { key: "previz", label: "黑白动作预演", shortLabel: "预演" },
    { key: "video", label: "视频生成", shortLabel: "视频" },
    { key: "delivery", label: "交付与打包", shortLabel: "交付" },
];

export function WorkflowStageLink({ href, active, step, index, label, shortLabel }: { href: string; active: boolean; step?: WorkflowStep; index: number; label: string; shortLabel: string }) {
    const completed = step?.status === "completed" || step?.status === "skipped";
    const failed = step?.status === "failed";
    return (
        <Link to={href} className={`workflow-stage-link ${active ? "is-active" : ""}`} aria-current={active ? "step" : undefined}>
            <span className={`workflow-stage-index ${completed ? "is-completed" : failed ? "is-failed" : ""}`}>
                {completed ? <Check className="size-3" /> : failed ? <CircleAlert className="size-3" /> : index + 1}
            </span>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
        </Link>
    );
}

export function StageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return <SectionHeader className="workflow-stage-heading" eyebrow={eyebrow} title={title} description={description} />;
}

export function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return <StatTile className="workflow-metric-card" icon={icon} label={label} value={value} />;
}

export function ArtifactStatus({ artifact, taskStatus, compact = false }: { artifact?: ShotArtifact; taskStatus?: TaskStatus; compact?: boolean }) {
    const className = `artifact-status-tag ${compact ? "is-compact" : ""}`;
    if (taskStatus === "queued" || taskStatus === "running" || (taskStatus === "succeeded" && !artifact)) {
        return <StatusBadge className={`${className} is-running`} tone="running" live dot>生成中</StatusBadge>;
    }
    if (taskStatus === "failed") return <StatusBadge className={`${className} is-failed`} tone="error">生成失败</StatusBadge>;
    if (!artifact) return <StatusBadge className={`${className} is-pending`} tone="neutral">待生成</StatusBadge>;
    const label = artifact.status === "ready" ? "已生成" : artifact.status === "failed" ? "生成失败" : artifact.status === "stale" ? "已过期" : "生成中";
    const tone = artifact.status === "ready" ? "ready" : artifact.status === "failed" ? "failed" : artifact.status === "stale" ? "stale" : "running";
    const statusTone: "success" | "error" | "warning" | "running" = artifact.status === "ready" ? "success" : artifact.status === "failed" ? "error" : artifact.status === "stale" ? "warning" : "running";
    return <StatusBadge className={`${className} is-${tone}`} tone={statusTone} live={statusTone === "running"} dot={statusTone === "running"}>{label}</StatusBadge>;
}

export function currentRevision(detail: ProjectDetail, shot?: ProjectShot): ShotRevision | undefined {
    if (!shot) return undefined;
    const revisions = detail.shotRevisions || [];
    return revisions.find((item) => item.id === shot.currentRevisionId)
        || revisions.filter((item) => item.shotId === shot.id).slice().sort((left, right) => right.version - left.version)[0];
}

export function currentArtifact(detail: ProjectDetail, shotId: string, type: string) {
    const artifacts = (detail.shotArtifacts || []).filter((item) => item.shotId === shotId && item.type === type).slice().sort((left, right) => right.version - left.version);
    return artifacts.find((item) => item.selected) || artifacts[0];
}

export function artifactTypeForStage(stage: ShortDramaWorkflowStage) {
    if (stage === "video") return "video";
    if (stage === "previz") return "action_board";
    return "storyboard";
}

export function assetCategoryLabel(category: string) {
    return ({ character: "角色", environment: "场景", wardrobe: "服饰", accessory: "配饰", prop: "道具", weapon: "武器", style: "画风" } as Record<string, string>)[category] || category || "其他";
}

export function formatDuration(durationMs: number) {
    if (durationMs < 60_000) return `${Math.round(durationMs / 100) / 10}s`;
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.round((durationMs % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
}

export function stageActionLabel(step?: WorkflowStep) {
    if (!step || step.status === "pending") return "等待上一步";
    if (step.status === "running" || step.status === "review") return "完成阶段";
    if (step.status === "completed") return "重新打开";
    if (step.status === "failed") return "重新开始";
    return "开始阶段";
}
