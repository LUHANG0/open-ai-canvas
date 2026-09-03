import { Alert, App, Button, Empty, Segmented } from "antd";
import { Download, Film, Layers3, Play, RefreshCcw, ScanLine } from "lucide-react";
import { useNavigate } from "react-router";

import { generationErrorMessage } from "@/lib/generation-error";
import type { GenerationTask } from "@/services/api/task-center";
import type { ProjectShot, ShotArtifact } from "@/services/api/projects";
import { resourceFileUrl } from "@/services/api/resources";

import { ArtifactStatus, formatDuration, type ShortDramaWorkflowStage } from "./workflow-shared";
import { workflowArtifactSpecificationLabel } from "./workflow-generation-prompt";
import { productionStageCopy } from "./workflow-production-types";

type Props = {
    activeStage: ShortDramaWorkflowStage;
    projectId: string;
    unitId: string;
    selectedShot: ProjectShot;
    shotTask?: GenerationTask;
    artifacts: ShotArtifact[];
    newestArtifact?: ShotArtifact;
    previewArtifact?: ShotArtifact;
    previewTab: "latest" | "history";
    resolution: string;
    imageQuality: string;
    generating: boolean;
    onPreviewTabChange: (tab: "latest" | "history") => void;
    onSelectArtifact: (artifact: ShotArtifact) => void;
    onGenerate: () => void;
};

export function WorkflowArtifactPreviewPanel({
    activeStage,
    projectId,
    unitId,
    selectedShot,
    shotTask,
    artifacts,
    newestArtifact,
    previewArtifact,
    previewTab,
    resolution,
    imageQuality,
    generating,
    onPreviewTabChange,
    onSelectArtifact,
    onGenerate,
}: Props) {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const stageCopy = productionStageCopy[activeStage as keyof typeof productionStageCopy];
    const taskState =
        shotTask?.status === "queued" ? "排队中" : shotTask?.status === "running" ? "生成中" : shotTask?.status === "failed" ? "生成失败" : shotTask?.status === "cancelled" ? "已取消" : newestArtifact ? `产物 v${newestArtifact.version}` : "待生成";
    return (
        <section className="workflow-preview-panel" aria-label="画面监看">
            <header className="workflow-preview-header">
                <div className="workflow-preview-header-row">
                    <div className="workflow-preview-title">
                        <ScanLine className="size-4 shrink-0" />
                        <span>
                            <strong>中央监看</strong>
                            <small>
                                {selectedShot.title || "未命名镜头"} · {formatDuration(selectedShot.durationMs)}
                            </small>
                        </span>
                    </div>
                    <div className="workflow-preview-header-actions">
                        <span className={`workflow-preview-task-state is-${shotTask?.status || (newestArtifact ? "ready" : "idle")}`}>{taskState}</span>
                        <Segmented
                            size="small"
                            value={previewTab}
                            onChange={(value) => onPreviewTabChange(value as typeof previewTab)}
                            options={[
                                { value: "latest", label: "最新" },
                                { value: "history", label: `历史 ${artifacts.length}` },
                            ]}
                        />
                    </div>
                </div>
                <Segmented
                    block
                    size="small"
                    className="workflow-preview-stage-switch"
                    value={activeStage}
                    options={[
                        { value: "storyboard", label: "分镜图" },
                        { value: "previz", label: "动作预演" },
                        { value: "video", label: "镜头视频" },
                    ]}
                    onChange={(nextStage) => navigate(`/projects/${projectId}/workflow/${unitId}/${nextStage}`)}
                />
            </header>
            <div className={`workflow-preview-scroll thin-scrollbar ${previewTab === "history" ? "is-history" : ""}`} aria-live="polite">
                {shotTask?.status === "failed" || shotTask?.status === "cancelled" ? (
                    <Alert
                        className="mb-3"
                        type={shotTask.status === "failed" ? "error" : "warning"}
                        showIcon
                        message={shotTask.status === "failed" ? "上次生成失败" : "上次生成已取消"}
                        description={shotTask.error ? generationErrorMessage(shotTask.error) : "可以检查模型与参考资产后重新提交。"}
                        action={
                            <Button size="small" onClick={onGenerate}>
                                重试
                            </Button>
                        }
                    />
                ) : null}
                {previewTab === "latest" ? (
                    <div className="workflow-monitor-stage">
                        <div className="workflow-monitor-stage-label">
                            <span>{stageCopy.label}</span>
                            <small>{workflowArtifactSpecificationLabel(activeStage, resolution, imageQuality)}</small>
                        </div>
                        <LatestPreview artifact={previewArtifact} emptyText={stageCopy.empty} />
                    </div>
                ) : (
                    <ArtifactHistory
                        artifacts={artifacts}
                        activeId={previewArtifact?.id}
                        onSelect={(artifact) => {
                            onSelectArtifact(artifact);
                            onPreviewTabChange("latest");
                        }}
                    />
                )}
                <div className="workflow-preview-details">
                    <div className="workflow-preview-summary">
                        <div className="flex items-center justify-between gap-2">
                            <span className="workflow-preview-summary-title">当前产物</span>
                            <ArtifactStatus artifact={newestArtifact} compact />
                        </div>
                        <div className="workflow-preview-summary-meta">
                            {newestArtifact ? `${formatDuration(selectedShot.durationMs)} · ${workflowArtifactSpecificationLabel(activeStage, resolution, imageQuality)} · v${newestArtifact.version}` : "当前镜头还没有生成产物"}
                        </div>
                    </div>
                    <div className="workflow-preview-actions">
                        <Button icon={<RefreshCcw className="size-3.5" />} loading={generating} onClick={onGenerate}>
                            重新生成
                        </Button>
                        <Button icon={<Download className="size-3.5" />} disabled={!previewArtifact?.resourceId} onClick={() => previewArtifact?.resourceId && void downloadArtifact(previewArtifact, selectedShot.title, message.error)}>
                            下载{activeStage === "video" ? "视频" : "图片"}
                        </Button>
                    </div>
                </div>
                {previewTab === "latest" ? <ArtifactHistory artifacts={artifacts.slice(0, 4)} activeId={previewArtifact?.id} onSelect={onSelectArtifact} compact /> : null}
            </div>
        </section>
    );
}

function LatestPreview({ artifact, emptyText }: { artifact?: ShotArtifact; emptyText: string }) {
    if (!artifact?.resourceId)
        return (
            <div className="workflow-media-empty">
                <span>
                    <Play className="size-7" />
                </span>
                <p>{emptyText}</p>
            </div>
        );
    const src = resourceFileUrl(artifact.resourceId);
    return (
        <div className="workflow-preview-media-frame">
            {artifact.type === "video" ? (
                <video className="workflow-preview-media" src={src} controls preload="metadata" />
            ) : (
                <img className={`workflow-preview-media ${artifact.type === "action_board" ? "grayscale" : ""}`} src={src} alt="镜头生成预览" loading="eager" />
            )}
        </div>
    );
}

function ArtifactHistory({ artifacts, activeId, onSelect, compact = false }: { artifacts: ShotArtifact[]; activeId?: string; onSelect: (artifact: ShotArtifact) => void; compact?: boolean }) {
    if (!artifacts.length) return compact ? null : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史版本" />;
    return (
        <section className={`workflow-history ${compact ? "is-compact" : ""}`}>
            <div className="workflow-history-title">历史版本</div>
            {artifacts.map((artifact) => (
                <button key={artifact.id} type="button" className={artifact.id === activeId ? "is-active" : ""} onClick={() => onSelect(artifact)}>
                    {artifact.resourceId ? (
                        artifact.type === "video" ? (
                            <video src={resourceFileUrl(artifact.resourceId)} muted preload="metadata" />
                        ) : (
                            <img src={resourceFileUrl(artifact.resourceId)} alt="" loading="lazy" />
                        )
                    ) : (
                        <span className="workflow-history-placeholder">
                            <Layers3 />
                        </span>
                    )}
                    <span className="min-w-0 flex-1">
                        <strong>
                            v{artifact.version}
                            {artifact.selected ? " · 当前" : ""}
                        </strong>
                        <small>{new Date(artifact.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
                    </span>
                    <ArtifactStatus artifact={artifact} compact />
                </button>
            ))}
        </section>
    );
}

async function downloadArtifact(artifact: ShotArtifact, shotTitle: string, onError: (content: string) => void) {
    if (!artifact.resourceId) return;
    try {
        const response = await fetch(resourceFileUrl(artifact.resourceId), { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${shotTitle || "shot"}-v${artifact.version}.${artifact.type === "video" ? "mp4" : "png"}`;
        anchor.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        onError(error instanceof Error ? `下载失败：${error.message}` : "下载失败");
    }
}
