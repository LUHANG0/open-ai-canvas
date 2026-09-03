import type { ReactNode } from "react";
import { ArrowRight, BookOpenText, Clock3, FolderKanban, Images, LayoutGrid, Trash2 } from "lucide-react";
import { Link } from "react-router";

import { resolveCanvasStylePreset, resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { parseStyleProfile } from "@/lib/canvas/style-profile";
import { projectSummaryCompletion, projectSummaryStage } from "@/lib/project-workbench";
import type { ProjectSummary } from "@/services/api/projects";
import { resourceFileUrl } from "@/services/api/resources";

import { sourceTypeLabel } from "./detail/shared";

export function ProjectListCard({ row, onDelete }: { row: ProjectSummary; onDelete: () => void }) {
    const completion = projectSummaryCompletion(row);
    const stage = projectSummaryStage(row);
    const projectStyle = resolveProjectCanvasStyle(row.project.stylePresetId, row.project.styleProfileJson);
    const styleTitle = projectStyle?.title || parseStyleProfile(row.project.styleProfileJson)?.title || resolveCanvasStylePreset(row.project.stylePresetId)?.title || (row.project.stylePresetId ? "自定义画风" : "未设置画风");
    const coverUrl = row.project.coverResourceId ? resourceFileUrl(row.project.coverResourceId) : projectStyle?.imageUrl;
    const description = row.project.description.trim() || stage.detail;
    return (
        <Link to={`/projects/${row.project.id}/overview`} className="library-card project-library-card group">
            <span className="project-library-cover">
                {coverUrl ? (
                    <img className="project-library-cover-art" src={coverUrl} alt="" />
                ) : (
                    <span className="project-library-cover-icon">
                        <FolderKanban className="size-7" />
                    </span>
                )}
                <span className="project-library-cover-scrim" />
                <span className="project-library-cover-ratio">{row.project.aspectRatio}</span>
                <span className="project-library-cover-stage">{stage.label}</span>
                <button
                    type="button"
                    className="project-library-cover-delete"
                    title="删除项目"
                    aria-label={`删除项目 ${row.project.name}`}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 className="size-3.5" />
                </button>
            </span>
            <span className="project-library-body">
                <span className="project-library-heading">
                    <strong title={row.project.name}>{row.project.name}</strong>
                    {row.project.status === "archived" ? <em>已归档</em> : null}
                    <ArrowRight className="project-library-arrow size-4" />
                </span>
                <span className="project-library-subtitle">
                    {styleTitle} · {sourceTypeLabel(row.project.sourceType)}
                </span>
                <span className="pc-short-drama-card-description">{description}</span>
                <span className="project-library-progress">
                    <span>
                        <span>
                            {row.completedUnitCount}/{row.unitCount} 章
                        </span>
                        <span>{completion}%</span>
                    </span>
                    <i className="pc-project-progress-legacy" aria-hidden="true">
                        <b style={{ width: `${completion}%` }} />
                    </i>
                    <progress className="pc-project-progress-pc" max={100} value={completion} aria-label={`${row.project.name}章节完成度 ${completion}%`} />
                </span>
                <span className="project-library-stats">
                    <ProjectCount icon={<BookOpenText className="size-3.5" />} label="章节" value={row.unitCount} />
                    <ProjectCount icon={<LayoutGrid className="size-3.5" />} label="画布" value={row.canvasCount} />
                    <ProjectCount icon={<Images className="size-3.5" />} label="资产" value={row.assetCount} />
                </span>
                <span className="pc-short-drama-card-updated">
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    <time dateTime={row.project.updatedAt}>{formatProjectUpdatedAt(row.project.updatedAt)}</time>
                </span>
            </span>
        </Link>
    );
}

function formatProjectUpdatedAt(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "更新时间未知";
    return `${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date)} 更新`;
}

function ProjectCount({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
    return (
        <span className="inline-flex items-center gap-1.5" title={`${value} ${label}`}>
            <span className="text-foreground/32">{icon}</span>
            <strong className="font-medium tabular-nums text-foreground/65">{value}</strong>
            <span>{label}</span>
        </span>
    );
}
