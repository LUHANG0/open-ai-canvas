import { useState } from "react";
import { ArrowRight, Clock3, FolderKanban, Trash2 } from "lucide-react";
import { Link } from "react-router";

import { resolveCanvasStylePreset, resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { parseStyleProfile } from "@/lib/canvas/style-profile";
import { projectSummaryCompletion, projectSummaryStage } from "@/lib/project-workbench";
import type { ProjectSummary } from "@/services/api/projects";
import { resourceFileUrl } from "@/services/api/resources";

import { sourceTypeLabel } from "./detail/shared";

export function ProjectListCard({ row, onDelete }: { row: ProjectSummary; onDelete: () => void }) {
    const [failedCover, setFailedCover] = useState<string>();
    const completion = projectSummaryCompletion(row);
    const stage = projectSummaryStage(row);
    const projectStyle = resolveProjectCanvasStyle(row.project.stylePresetId, row.project.styleProfileJson);
    const styleTitle = projectStyle?.title || parseStyleProfile(row.project.styleProfileJson)?.title || resolveCanvasStylePreset(row.project.stylePresetId)?.title || (row.project.stylePresetId ? "自定义画风" : "未设置画风");
    const coverUrl = row.project.coverResourceId ? resourceFileUrl(row.project.coverResourceId) : projectStyle?.imageUrl;
    return (
        <article className="library-card project-library-card group">
            <Link to={`/projects/${row.project.id}/overview`} className="project-library-open" aria-label={`打开项目 ${row.project.name}`}>
                <span className="project-library-cover">
                    {coverUrl && failedCover !== coverUrl ? (
                        <img className="project-library-cover-art" src={coverUrl} alt="" loading="lazy" onError={() => setFailedCover(coverUrl)} />
                    ) : (
                        <span className="project-library-cover-icon">
                            <FolderKanban className="size-7" />
                        </span>
                    )}
                    <span className="project-library-cover-scrim" />
                    <span className="project-library-cover-ratio">{row.project.aspectRatio}</span>
                    <span className="project-library-cover-stage">{stage.label}</span>
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
                    <span className="project-library-progress">
                        <span>
                            <span>
                                {row.completedUnitCount}/{row.unitCount} 章
                            </span>
                            <span>{completion}%</span>
                        </span>
                        <progress className="pc-project-progress-pc" max={100} value={completion} aria-label={`${row.project.name}章节完成度 ${completion}%`} />
                    </span>
                    <span className="pc-short-drama-card-meta">
                        <span>
                            {row.unitCount} 章 · {row.canvasCount} 画布
                        </span>
                        <span className="pc-short-drama-card-updated">
                            <Clock3 className="size-3.5" aria-hidden="true" />
                            <time dateTime={row.project.updatedAt}>{formatProjectUpdatedAt(row.project.updatedAt)}</time>
                        </span>
                    </span>
                </span>
            </Link>
            <button type="button" className="project-library-cover-delete" title="删除项目" aria-label={`删除项目 ${row.project.name}`} onClick={onDelete}>
                <Trash2 className="size-3.5" />
            </button>
        </article>
    );
}

function formatProjectUpdatedAt(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "更新时间未知";
    return `${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date)} 更新`;
}
