import { App, Input, Tooltip } from "antd";
import { CanvasAnchoredDropdown as Dropdown } from "./canvas-anchored-dropdown";
import { Download, LoaderCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CanvasLibraryCover } from "./canvas-library-cover";
import { formatProjectTime } from "./canvas-project-card";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { CanvasLibrarySummary } from "@/services/api/user-data";
import { loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { cn } from "@/lib/utils";

type CanvasFolderCardProps = {
    project: CanvasLibrarySummary;
    projectName?: string;
    href: string;
    selectionMode?: boolean;
    selectionDisabled?: boolean;
    onClick: () => void;
    onPrefetch?: () => void;
    opening?: boolean;
};

/** The stretched link and normal-flow editor are siblings, never nested controls. */
export function CanvasFolderCard({ project, projectName, href, selectionMode = false, selectionDisabled = false, onClick, onPrefetch, opening = false }: CanvasFolderCardProps) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectionMode && !selectionDisabled && selectedIds.includes(project.id);
    // Reset only on a new edit event; Enter, blur and Escape share this submission fence.
    const titleHandledRef = useRef(false);
    const saveTitle = async () => {
        if (!editing || titleHandledRef.current) return;
        titleHandledRef.current = true;
        stopEditing();
        try {
            await loadCanvasProjectForEditing(project.id);
            renameProject(project.id, editingTitle);
            await saveRemoteUserDataNow(project.id);
            await queryClient.invalidateQueries({ queryKey: ["canvas-library"] });
        } catch (error) { message.error(error instanceof Error ? error.message : "重命名失败"); }
    };
    const exportProject = async () => {
        try {
            const fullProject = await loadCanvasProjectForEditing(project.id);
            if (!fullProject) throw new Error("画布不存在");
            await exportCanvasProjects([fullProject], project.title || "画布");
        } catch (error) { message.error(error instanceof Error ? error.message : "导出失败"); }
    };

    return (
        <article className={cn("product-collection-card canvas-collection-card", selected && "is-selected", editing && "is-editing", opening && "is-opening")} onPointerEnter={onPrefetch} onPointerDown={onPrefetch} onFocusCapture={onPrefetch}>
            <Tooltip title={editing ? null : `${project.title}${projectName ? ` · 所属项目：${projectName}` : " · 自由画布"}`} trigger={["hover", "focus"]}>
                <Link to={href} className="canvas-collection-open" role={selectionMode ? "checkbox" : undefined} aria-checked={selectionMode ? selected : undefined} aria-label={`${selectionMode ? "选择" : "打开画布"} ${project.title}`} aria-busy={opening} aria-disabled={editing || opening || (selectionMode && selectionDisabled)} tabIndex={editing ? -1 : 0} onClick={(event) => {
                    if (editing || opening) { event.preventDefault(); return; }
                    // Modified clicks retain native new-tab/window navigation outside editing.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    if (selectionMode) {
                        if (!selectionDisabled) toggleSelected(project.id, !selected);
                    } else onClick();
                }} onKeyDown={(event) => {
                    if (!selectionMode || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    if (!editing && !opening && !selectionDisabled) toggleSelected(project.id, !selected);
                }} />
            </Tooltip>
            <div className="canvas-collection-preview" aria-hidden="true">
                <CanvasLibraryCover project={project} />
                {opening ? <div className="canvas-collection-opening"><LoaderCircle className="size-5 animate-spin" /><span>正在打开</span></div> : null}
            </div>
            <div className="canvas-collection-body">
                <div className="canvas-collection-heading-row">
                    {editing ? <Input
                        className="canvas-collection-title-input"
                        aria-label="画布名称"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onBlur={() => void saveTitle()}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") { event.preventDefault(); void saveTitle(); }
                            if (event.key === "Escape") { titleHandledRef.current = true; stopEditing(); }
                        }}
                        autoFocus
                    /> : <span className="canvas-collection-title">{project.title}</span>}
                </div>
                <div className="canvas-collection-footer">
                    <div className="canvas-collection-meta">
                        <span className="canvas-collection-meta-item" title={projectName ? `所属项目：${projectName}` : "自由画布"}>{projectName || "自由画布"}</span>
                        <span className="canvas-collection-meta-separator" aria-hidden="true">·</span>
                        <span className="canvas-collection-node-count">{project.nodeCount} 个节点</span>
                    </div>
                    <time className="canvas-collection-updated" dateTime={project.updatedAt} title={`更新于 ${formatCanvasDate(project.updatedAt)} · 创建于 ${formatCanvasDate(project.createdAt)}`}>{formatProjectTime(project.updatedAt)}</time>
                </div>
            </div>
            {selectionMode ? <label className="canvas-collection-select is-visible" onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" checked={selected} disabled={selectionDisabled || editing} onChange={(event) => toggleSelected(project.id, event.target.checked)} aria-label={`选择 ${project.title}`} />
            </label> : null}
            <div className="canvas-collection-actions" onClick={(event) => event.stopPropagation()}>
                <Dropdown trigger={["click"]} placement="bottomRight" openClassName="is-open" menu={{
                    onClick: ({ domEvent }) => domEvent.stopPropagation(),
                    items: [
                        { key: "rename", disabled: selectionDisabled, icon: <Pencil className="size-3.5" />, label: "重命名", onClick: () => { titleHandledRef.current = false; startEditing(project.id, project.title); } },
                        { key: "export", disabled: selectionDisabled, icon: <Download className="size-3.5" />, label: "导出画布", onClick: () => void exportProject() },
                        { type: "divider" },
                        { key: "delete", disabled: selectionDisabled, danger: true, icon: <Trash2 className="size-3.5" />, label: "删除", onClick: () => setDeleteIds([project.id]) },
                    ],
                }}>
                    <button type="button" className="product-icon-button canvas-collection-more" aria-label={`${project.title} 画布操作`} title="更多操作" onClick={(event) => event.stopPropagation()}><MoreHorizontal /></button>
                </Dropdown>
            </div>
        </article>
    );
}

function formatCanvasDate(value: string) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
        ? new Date(timestamp).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "时间不可用";
}
