import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Tooltip } from "antd";
import {
    ArrowDown,
    Check,
    ChevronDown,
    ChevronLeft,
    Clapperboard,
    Copy,
    FileText,
    Film,
    History,
    Image as ImageIcon,
    LoaderCircle,
    Maximize2,
    MessageSquareText,
    Music2,
    Plus,
    RefreshCw,
    SlidersHorizontal,
    Sparkles,
    X,
} from "lucide-react";
import { Link } from "react-router";

import { AIMessageMarkdown } from "@/components/ai/ai-message-markdown";
import { creationCanvasHandoffPath, creationResultAssetIds, creationResultMediaEntries, type CreationResultMediaEntry } from "@/lib/canvas/canvas-asset-handoff";
import { generationErrorMessage } from "@/lib/generation-error";
import { useCopyText } from "@/hooks/use-copy-text";
import { formatVideoResolutionLabel as videoResolutionLabel } from "@/lib/video-generation-options";
import { useAssetStore } from "@/stores/use-asset-store";
import { creationAttachmentKind, creationMediaAspectRatio, type CreationAttachment } from "./creation-assets";
import { creationVideoOperationOptions } from "./creation-composer";
import type { CreationMode } from "./creation-empty-state";
import {
    CreationMediaPreviewModal,
    CreationMessageReferences,
    CreationResultDownloads,
    CreationVideoSupplementalImages,
    StoryboardResultDownloads,
    formatMessageTime,
} from "./creation-message-view";
import { displayCreationPrompt } from "./creation-references";
import type { CreationMessage, CreationSettings, CreationShot, CreationViewMode } from "./creation-types";
import { CreationViewSwitch } from "./creation-workspace-toolbar";

type StoryboardShotState = "queued" | "pending" | "done" | "error" | "cancelled";

const storyboardShotStateLabels: Record<StoryboardShotState, string> = {
    queued: "待生成",
    pending: "生成中",
    done: "已完成",
    error: "生成失败",
    cancelled: "已停止",
};

const modeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };
const shotScriptLabels: Record<CreationMode, string> = { text: "创作思路", image: "画面指令", video: "镜头脚本" };

function storyboardShotState(shot: CreationShot): StoryboardShotState {
    const status = shot.result?.status;
    if (status === "pending" || status === "streaming") return "pending";
    if (status === "done") return "done";
    if (status === "error") return "error";
    if (status === "cancelled") return "cancelled";
    return "queued";
}

function storyboardShotTitle(shot: CreationShot) {
    return shot.user ? displayCreationPrompt(shot.user.content, shot.user.references || []).trim() || "未命名镜头" : "未命名镜头";
}

type CreationThinking = { title: string; hint: string; steps: string[] };

function thinkingFor(mode: CreationMode): CreationThinking {
    if (mode === "image") return { title: "正在为你画这一镜", hint: "影策正在理解你的构图意图，并把画面交给模型出图。", steps: ["理解构图", "定调画风", "生成画面"] };
    if (mode === "text") return { title: "正在为你写这段", hint: "影策正在梳理你的创作脉络，组织语言与结构。", steps: ["梳理脉络", "组织语言", "输出段落"] };
    return { title: "正在为你拍这一镜", hint: "影策正在拆解你的镜头脚本，设计运镜与光线，并交给模型渲染成片。", steps: ["拆解镜头", "设计运镜", "定调布光", "渲染成片"] };
}

function directorNoteFor(mode: CreationMode, settings: CreationSettings): string {
    if (mode === "video") return `已按 ${[`${settings.seconds}s`, ...(settings.videoQuality ? [videoResolutionLabel(settings.videoQuality)] : []), settings.ratio].join(" · ")} 渲染这一镜，等待你的下一句指令。`;
    if (mode === "image") return `已按 ${settings.ratio} 出图 ${settings.count} 张，等待你的下一句指令。`;
    return "";
}

export function StoryboardShotRail({
    shots,
    activeShotId,
    composing,
    onSelect,
    onBeginCompose,
    onFocusCompose,
    onCancelCompose,
    onClose,
}: {
    shots: CreationShot[];
    activeShotId: string;
    composing: boolean;
    onSelect: (shotId: string) => void;
    onBeginCompose: () => void;
    onFocusCompose: () => void;
    onCancelCompose: () => void;
    onClose: () => void;
}) {
    const assets = useAssetStore((state) => state.assets);
    const activeItemRef = useRef<HTMLButtonElement>(null);
    const nextShotNumber = shots.length + 1;
    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [activeShotId, composing]);
    return (
        <aside id="storyboard-timeline" className="storyboard-editor-rail" aria-label="镜头轨道">
            <header className="storyboard-editor-rail-head">
                <div>
                    <Clapperboard />
                    <span>
                        <strong>镜头轨道</strong>
                        <small>
                            {shots.length} 个镜头{composing ? " · 1 个草稿" : ""}
                        </small>
                    </span>
                </div>
                <button type="button" aria-label="收起镜头轨道" onClick={onClose}>
                    <ChevronLeft />
                </button>
            </header>
            <ol className="storyboard-editor-rail-list creation-scrollbar" aria-label="镜头列表">
                {shots.map((shot, index) => {
                    const status = storyboardShotState(shot);
                    const title = storyboardShotTitle(shot);
                    const resultUrls = shot.result?.resultUrls || [];
                    const media = shot.result ? creationResultMediaEntries(assets, { messageId: shot.result.id, taskIds: shot.result.taskIds || [], resultUrls, mode: shot.result.mode === "video" ? "video" : "image" }) : [];
                    const primary = media.find((entry) => entry.kind === "video") || media.find((entry) => entry.kind === "image");
                    const active = shot.id === activeShotId && !composing;
                    const settings = shot.result?.settings || shot.user?.settings;
                    const shotMode = shot.result?.mode || shot.user?.mode || "video";
                    const shotMeta = [modeLabels[shotMode], shotMode === "video" && settings?.seconds ? `${settings.seconds}s` : ""].filter(Boolean).join(" · ");
                    const shotCode = `SC.${String(index + 1).padStart(2, "0")}`;
                    return (
                        <li key={shot.id}>
                            <button
                                ref={active ? activeItemRef : undefined}
                                type="button"
                                aria-current={active ? "true" : undefined}
                                aria-label={`${shotCode}，${storyboardShotStateLabels[status]}，${title}，${shotMeta}`}
                                title={title}
                                className={`storyboard-editor-shot${active ? " is-active" : ""}`}
                                onClick={() => onSelect(shot.id)}
                            >
                                <span className="storyboard-editor-shot-thumb">
                                    {primary?.url ? (
                                        primary.kind === "video" ? (
                                            <video muted preload="metadata" src={primary.url} />
                                        ) : (
                                            <img src={primary.url} alt="" />
                                        )
                                    ) : (
                                        <span className="storyboard-editor-shot-thumb-placeholder">
                                            <Clapperboard />
                                        </span>
                                    )}
                                    <em>{shotCode}</em>
                                    <span className={`storyboard-editor-shot-thumb-state is-${status}`} aria-hidden="true">
                                        <i />
                                        <span>{storyboardShotStateLabels[status]}</span>
                                    </span>
                                </span>
                                <span className="storyboard-editor-shot-info">
                                    <span className="storyboard-editor-shot-meta">
                                        <span>{shotCode}</span>
                                        <span className={`storyboard-editor-shot-state is-${status}`}>{storyboardShotStateLabels[status]}</span>
                                    </span>
                                    <strong>{title}</strong>
                                    <small>{shotMeta}</small>
                                </span>
                            </button>
                        </li>
                    );
                })}
                {composing ? (
                    <li className="storyboard-editor-draft-item">
                        <button ref={activeItemRef} type="button" aria-current="true" className="storyboard-editor-shot is-draft is-active" onClick={onFocusCompose}>
                            <span className="storyboard-editor-shot-thumb">
                                <span className="storyboard-editor-shot-thumb-placeholder">
                                    <Clapperboard />
                                </span>
                                <em>SC.{String(nextShotNumber).padStart(2, "0")}</em>
                            </span>
                            <span className="storyboard-editor-shot-info">
                                <span className="storyboard-editor-shot-meta">
                                    <span>SC.{String(nextShotNumber).padStart(2, "0")}</span>
                                    <span className="storyboard-editor-shot-state is-draft">草稿</span>
                                </span>
                                <strong>正在撰写下一镜</strong>
                                <small>草稿尚未提交</small>
                            </span>
                        </button>
                        <button type="button" className="storyboard-editor-draft-collapse" aria-label="收起镜头草稿" onClick={onCancelCompose}>
                            <X />
                        </button>
                    </li>
                ) : null}
            </ol>
            <footer className="storyboard-editor-rail-footer">
                <button type="button" onClick={onBeginCompose}>
                    <Plus />
                    新增镜头
                </button>
            </footer>
        </aside>
    );
}

export function StoryboardComposerContext({
    shotNumber,
    composing,
    hasDraft,
    sourceShotNumber,
    onBeginCompose,
    onCollapse,
}: {
    shotNumber: number;
    composing: boolean;
    hasDraft: boolean;
    sourceShotNumber?: number;
    onBeginCompose: () => void;
    onCollapse: () => void;
}) {
    const shotCode = `SC.${String(shotNumber).padStart(2, "0")}`;
    return (
        <header className={`storyboard-editor-composer-context${composing ? " is-composing" : ""}`} aria-live="polite">
            <span className="storyboard-editor-composer-icon">
                <Clapperboard />
            </span>
            <span className="storyboard-editor-composer-copy">
                <strong>{composing ? `正在撰写 ${shotCode}` : hasDraft ? `${shotCode} 草稿已保留` : `下一镜 ${shotCode}`}</strong>
                <small>{sourceShotNumber ? `复用 SC.${String(sourceShotNumber).padStart(2, "0")} 的提示词、素材与参数；提交后仍会创建新镜头` : "这里的每次提交都会创建一个新镜头，不会覆盖当前浏览的镜头"}</small>
            </span>
            <button type="button" onClick={composing ? onCollapse : onBeginCompose}>
                {composing ? <ChevronDown /> : <Plus />}
                {composing ? "收起草稿" : hasDraft ? "继续编辑" : "开始撰写"}
            </button>
        </header>
    );
}

export function StoryboardToolbar({
    shots,
    activeIndex,
    composing,
    onSelect,
    onBeginCompose,
    onCancelCompose,
    onNewConversation,
    onOpenHistory,
    viewMode,
    onViewModeChange,
}: {
    shots: CreationShot[];
    activeIndex: number;
    composing: boolean;
    onSelect: (index: number) => void;
    onBeginCompose: () => void;
    onCancelCompose: () => void;
    onNewConversation: () => void;
    onOpenHistory: () => void;
    viewMode: CreationViewMode;
    onViewModeChange: (mode: CreationViewMode) => void;
}) {
    const [railOpen, setRailOpen] = useState(false);
    const nextShotNumber = shots.length + 1;
    const closeRail = () => setRailOpen(false);
    const statusOf = (shot: CreationShot) => shot.result?.status || "queued";
    const shotTitle = (shot: CreationShot) => (shot.user ? displayCreationPrompt(shot.user.content, shot.user.references || []).trim() || "未命名镜头" : "镜头");
    return (
        <header className="storyboard-workbench-bar" aria-label="镜头工具条">
            <div className="storyboard-workbench-rail">
                <Tooltip title="镜头时间线">
                    <button type="button" className={`storyboard-workbench-rail-button${railOpen ? " is-open" : ""}${composing ? " is-draft" : ""}`} aria-expanded={railOpen} aria-label="镜头时间线" onClick={() => setRailOpen((value) => !value)}>
                        <Film />
                        <span className="storyboard-workbench-rail-badge">{composing ? nextShotNumber : shots.length}</span>
                    </button>
                </Tooltip>
                {railOpen ? (
                    <div className="storyboard-workbench-rail-pop" role="listbox" aria-label="镜头列表">
                        <div className="storyboard-workbench-rail-pop-head">
                            <span className="storyboard-workbench-rail-pop-title">
                                <Clapperboard />
                                镜头时间线<small>{composing ? `下一镜 SC.${String(nextShotNumber).padStart(2, "0")}` : `${shots.length} 个镜头`}</small>
                            </span>
                            <button type="button" className="storyboard-workbench-rail-pop-close" aria-label="关闭镜头列表" onClick={closeRail}>
                                <X />
                            </button>
                        </div>
                        <ul className="creation-scrollbar">
                            {shots.map((shot, index) => {
                                const status = statusOf(shot);
                                const title = shotTitle(shot);
                                const thumbUrl = shot.result?.resultUrls?.[0];
                                const thumbIsVideo = shot.result?.mode === "video";
                                return (
                                    <li key={shot.user?.id || shot.result?.id || index}>
                                        <button
                                            type="button"
                                            className={`storyboard-workbench-rail-row${index === activeIndex && !composing ? " is-active" : ""}`}
                                            onClick={() => {
                                                onSelect(index);
                                                closeRail();
                                            }}
                                        >
                                            <span className="storyboard-workbench-rail-thumb">
                                                {thumbUrl ? (
                                                    thumbIsVideo ? (
                                                        <video muted preload="metadata" src={thumbUrl} />
                                                    ) : (
                                                        <img src={thumbUrl} alt="" />
                                                    )
                                                ) : (
                                                    <span className="storyboard-workbench-rail-thumb-ph">
                                                        <Clapperboard />
                                                        <em>SC.{String(index + 1).padStart(2, "0")}</em>
                                                    </span>
                                                )}
                                            </span>
                                            <span className="storyboard-workbench-rail-info">
                                                <span className="storyboard-workbench-rail-head">
                                                    <span className="storyboard-workbench-rail-row-shot">SC.{String(index + 1).padStart(2, "0")}</span>
                                                    <span className={`storyboard-workbench-rail-row-state is-${status}`}>{status === "pending" ? "生成中" : status === "error" ? "失败" : status === "done" ? "完成" : "待生成"}</span>
                                                    {shot.result?.createdAt ? <time dateTime={shot.result.createdAt}>{formatMessageTime(shot.result.createdAt)}</time> : null}
                                                </span>
                                                <span className="storyboard-workbench-rail-row-title">{title}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                            {composing ? (
                                <li>
                                    <button
                                        type="button"
                                        className="storyboard-workbench-rail-row is-draft"
                                        onClick={() => {
                                            onCancelCompose();
                                            closeRail();
                                        }}
                                    >
                                        <span className="storyboard-workbench-rail-thumb">
                                            <span className="storyboard-workbench-rail-thumb-ph">
                                                <Clapperboard />
                                                <em>SC.{String(nextShotNumber).padStart(2, "0")}</em>
                                            </span>
                                        </span>
                                        <span className="storyboard-workbench-rail-info">
                                            <span className="storyboard-workbench-rail-head">
                                                <span className="storyboard-workbench-rail-row-shot">SC.{String(nextShotNumber).padStart(2, "0")}</span>
                                                <span className="storyboard-workbench-rail-row-state">待撰写</span>
                                            </span>
                                            <span className="storyboard-workbench-rail-row-title">等待你的脚本</span>
                                        </span>
                                    </button>
                                </li>
                            ) : null}
                        </ul>
                        <button
                            type="button"
                            className="storyboard-workbench-rail-pop-add"
                            onClick={() => {
                                closeRail();
                                onBeginCompose();
                            }}
                        >
                            <Plus />
                            新增镜头
                        </button>
                    </div>
                ) : null}
            </div>
            <div className="storyboard-workbench-bar-actions">
                <CreationViewSwitch viewMode={viewMode} onChange={onViewModeChange} />
                <Tooltip title={composing ? "收起下一镜" : "新增镜头"}>
                    <button type="button" aria-label={composing ? "收起下一镜" : "新增镜头"} className="storyboard-workbench-bar-action" onClick={composing ? onCancelCompose : onBeginCompose}>
                        {composing ? <X /> : <Clapperboard />}
                    </button>
                </Tooltip>
                <Tooltip title="新建创作">
                    <button type="button" aria-label="新建创作" className="storyboard-workbench-bar-action" onClick={onNewConversation}>
                        <Plus />
                    </button>
                </Tooltip>
                <Tooltip title="历史对话">
                    <button type="button" aria-label="查看历史对话" className="storyboard-workbench-bar-action" onClick={onOpenHistory}>
                        <History />
                    </button>
                </Tooltip>
            </div>
        </header>
    );
}

export function StoryboardShotCard({
    shot,
    shotNumber,
    modelName,
    busy,
    compactLayout,
    onRetryFailure,
    onCreateVariant,
}: {
    shot: CreationShot;
    shotNumber: number;
    modelName: string;
    busy: boolean;
    compactLayout: boolean;
    onRetryFailure: () => void;
    onCreateVariant: () => void;
}) {
    const user = shot.user;
    const result = shot.result;
    const normalizedStoryboardStatus = storyboardShotState(shot);
    const status = compactLayout ? normalizedStoryboardStatus : result?.status || "queued";
    const mode = result?.mode || user?.mode || "video";
    const briefVisible = Boolean(user?.content.trim() || user?.references?.length || user?.attachments?.length);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const copyText = useCopyText();
    const assets = useAssetStore((state) => state.assets);
    const visiblePrompt = user ? displayCreationPrompt(user.content, user.references || []) : "";
    const shotTitle = visiblePrompt.trim() || `镜头 ${shotNumber}`;
    const resultUrls = result?.resultUrls || [];
    const resultAssetIds = result && resultUrls.length ? creationResultAssetIds(assets, { messageId: result.id, taskIds: result.taskIds || [], resultUrls }) : [];
    const resultMedia = result ? creationResultMediaEntries(assets, { messageId: result.id, taskIds: result.taskIds || [], resultUrls, mode: result.mode === "video" ? "video" : "image" }) : [];
    const canvasHandoffPath = result ? creationCanvasHandoffPath(resultAssetIds, resultUrls.length) : "";
    const canvasPath = canvasHandoffPath || "/canvas";
    const settings = result?.settings || user?.settings;
    const videoOperationLabel = mode === "video" && settings?.videoOperation ? creationVideoOperationOptions.find((option) => option.value === settings.videoOperation)?.label : "";
    useEffect(() => setInspectorOpen(false), [shot.id]);
    return (
        <article
            className={`storyboard-workbench-card${compactLayout ? " storyboard-editor-shot-card" : ""} is-${status}${compactLayout && inspectorOpen ? " is-inspector-open" : ""}`}
            aria-busy={status === "pending" || status === "streaming" ? true : undefined}
        >
            <header className="storyboard-workbench-card-head">
                <div className="storyboard-workbench-card-heading">
                    <span className="storyboard-workbench-card-shot">
                        <span className="storyboard-workbench-card-shot-index">SC.{String(shotNumber).padStart(2, "0")}</span>
                        <span className="storyboard-workbench-card-summary">
                            <span className="storyboard-workbench-card-title" title={shotTitle}>
                                {shotTitle}
                            </span>
                            <span className="storyboard-workbench-card-meta">
                                <span className="storyboard-workbench-card-mode">
                                    {mode === "video" ? <Film /> : mode === "image" ? <ImageIcon /> : <MessageSquareText />}
                                    {modeLabels[mode]}
                                </span>
                                {modelName ? <span className="storyboard-workbench-card-model">{modelName}</span> : null}
                            </span>
                        </span>
                    </span>
                    {status === "pending" ? (
                        <span className="storyboard-workbench-card-state is-pending">
                            <LoaderCircle className="animate-spin" />
                            生成中
                        </span>
                    ) : status === "error" ? (
                        <span className="storyboard-workbench-card-state is-error">生成失败</span>
                    ) : status === "done" ? (
                        <span className="storyboard-workbench-card-state is-done">
                            <Check />
                            已完成
                        </span>
                    ) : compactLayout && status === "cancelled" ? (
                        <span className="storyboard-workbench-card-state is-cancelled">已停止</span>
                    ) : (
                        <span className="storyboard-workbench-card-state">待生成</span>
                    )}
                </div>
                <div className="storyboard-workbench-card-actions">
                    {compactLayout ? (
                        <button type="button" className="storyboard-editor-inspector-toggle" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}>
                            <SlidersHorizontal />
                            {inspectorOpen ? "查看结果" : "镜头信息"}
                        </button>
                    ) : null}
                    {status === "error" || (compactLayout && status === "cancelled") ? (
                        <button type="button" onClick={onRetryFailure} disabled={busy}>
                            <RefreshCw />
                            重新生成
                        </button>
                    ) : null}
                    {status === "done" && result?.resultUrls?.length ? (
                        <button type="button" className="storyboard-workbench-card-action is-emphasis" onClick={onCreateVariant} disabled={busy}>
                            <RefreshCw />
                            {compactLayout ? "复用为新镜头" : "生成变体"}
                        </button>
                    ) : null}
                    {status === "done" && resultUrls.length ? (
                        <Link className="storyboard-workbench-card-action" to={canvasPath}>
                            {canvasHandoffPath ? "添加到画布" : "打开画布"}
                        </Link>
                    ) : null}
                    {compactLayout ? <StoryboardResultDownloads results={resultMedia} /> : <CreationResultDownloads results={resultMedia} />}
                </div>
            </header>
            <div className="storyboard-workbench-card-body">
                {compactLayout ? (
                    <div className="storyboard-editor-shot-layout">
                        <section className="storyboard-editor-preview-pane" aria-label={`镜头 ${shotNumber} 的生成结果`}>
                            <header className="storyboard-editor-preview-head">
                                <span>
                                    <Sparkles />
                                    结果舞台
                                </span>
                                {result?.createdAt ? <time dateTime={result.createdAt}>{formatMessageTime(result.createdAt)}</time> : <small>{storyboardShotStateLabels[normalizedStoryboardStatus]}</small>}
                            </header>
                            <div className="storyboard-editor-preview-canvas creation-scrollbar" tabIndex={0}>
                                <div className="storyboard-editor-preview-content">
                                    <StoryboardShotResult result={result} resultMedia={resultMedia} onRetryFailure={onRetryFailure} compactLayout />
                                </div>
                            </div>
                        </section>
                        <aside className="storyboard-editor-inspector creation-scrollbar" aria-label={`镜头 ${shotNumber} 的镜头信息`}>
                            <header className="storyboard-editor-inspector-head">
                                <span>
                                    <SlidersHorizontal />
                                    镜头信息
                                </span>
                                <small>SC.{String(shotNumber).padStart(2, "0")}</small>
                            </header>
                            <section className="storyboard-editor-inspector-section is-script">
                                <header>
                                    <span>创作内容</span>
                                    {user?.createdAt ? <time dateTime={user.createdAt}>{formatMessageTime(user.createdAt)}</time> : null}
                                    {visiblePrompt ? (
                                        <Tooltip title="复制镜头脚本">
                                            <button type="button" aria-label="复制提示词" onClick={() => copyText(visiblePrompt, "提示词已复制")}>
                                                <Copy />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                </header>
                                {briefVisible && user ? (
                                    <>
                                        <p>{visiblePrompt}</p>
                                        {user.references?.length ? <CreationMessageReferences references={user.references} /> : null}
                                        {user.attachments?.length ? <StoryboardBriefAttachments attachments={user.attachments} /> : null}
                                    </>
                                ) : (
                                    <span className="storyboard-editor-inspector-empty">这一镜还没有创作描述</span>
                                )}
                            </section>
                            <section className="storyboard-editor-inspector-section is-settings">
                                <header>
                                    <span>生成参数</span>
                                </header>
                                <dl>
                                    <div>
                                        <dt>类型</dt>
                                        <dd>{modeLabels[mode]}</dd>
                                    </div>
                                    {modelName ? (
                                        <div>
                                            <dt>模型</dt>
                                            <dd title={modelName}>{modelName}</dd>
                                        </div>
                                    ) : null}
                                    {settings?.ratio ? (
                                        <div>
                                            <dt>画幅</dt>
                                            <dd>{settings.ratio}</dd>
                                        </div>
                                    ) : null}
                                    {mode === "video" && settings?.videoQuality ? (
                                        <div>
                                            <dt>清晰度</dt>
                                            <dd>{videoResolutionLabel(settings.videoQuality)}</dd>
                                        </div>
                                    ) : null}
                                    {videoOperationLabel ? (
                                        <div>
                                            <dt>生成方式</dt>
                                            <dd>{videoOperationLabel}</dd>
                                        </div>
                                    ) : null}
                                    {mode === "video" && settings?.seconds ? (
                                        <div>
                                            <dt>时长</dt>
                                            <dd>{settings.seconds}s</dd>
                                        </div>
                                    ) : null}
                                    {mode === "video" && settings?.generateAudio !== undefined ? (
                                        <div>
                                            <dt>声音</dt>
                                            <dd>{settings.generateAudio === "true" ? "有声音" : "无声音"}</dd>
                                        </div>
                                    ) : null}
                                    {mode === "image" && settings?.count ? (
                                        <div>
                                            <dt>数量</dt>
                                            <dd>{settings.count} 张</dd>
                                        </div>
                                    ) : null}
                                </dl>
                            </section>
                        </aside>
                    </div>
                ) : (
                    <div className="storyboard-workbench-thread" aria-label={`镜头 ${shotNumber} 的对话过程`}>
                        {briefVisible && user ? (
                            <div className="storyboard-workbench-turn is-user">
                                <div className="storyboard-workbench-turn-copy">
                                    <div className="storyboard-workbench-turn-meta">
                                        <span className="storyboard-workbench-turn-role">{shotScriptLabels[mode]}</span>
                                        {user.createdAt ? (
                                            <time className="storyboard-workbench-turn-time" dateTime={user.createdAt}>
                                                {formatMessageTime(user.createdAt)}
                                            </time>
                                        ) : null}
                                        <Tooltip title="复制消息">
                                            <button type="button" className="creation-user-message-copy" aria-label="复制提示词" onClick={() => copyText(visiblePrompt, "提示词已复制")}>
                                                <Copy />
                                            </button>
                                        </Tooltip>
                                    </div>
                                    <div className="storyboard-workbench-turn-bubble">
                                        <p className="storyboard-workbench-turn-text">{visiblePrompt}</p>
                                        {user.references?.length ? <CreationMessageReferences references={user.references} /> : null}
                                        {user.attachments?.length ? <StoryboardBriefAttachments attachments={user.attachments} /> : null}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {briefVisible && user ? (
                            <div className="storyboard-workbench-handoff" aria-hidden="true">
                                <span className="storyboard-workbench-handoff-rail" />
                                <span className="storyboard-workbench-handoff-badge">
                                    <ArrowDown />
                                    交给影策 AI
                                </span>
                                <span className="storyboard-workbench-handoff-rail" />
                            </div>
                        ) : null}
                        <div className="storyboard-workbench-turn is-ai">
                            <span className="storyboard-workbench-ai-avatar">
                                <Clapperboard />
                            </span>
                            <div className="storyboard-workbench-turn-copy">
                                <div className="storyboard-workbench-turn-meta">
                                    <span className="storyboard-workbench-turn-role is-ai">
                                        <Sparkles />
                                        影策 AI
                                    </span>
                                    {modelName ? <span className="storyboard-workbench-turn-model">{modelName}</span> : null}
                                    {result?.createdAt ? (
                                        <time className="storyboard-workbench-turn-time" dateTime={result.createdAt}>
                                            {formatMessageTime(result.createdAt)}
                                        </time>
                                    ) : null}
                                </div>
                                <div className="storyboard-workbench-turn-bubble">
                                    <StoryboardShotResult result={result} resultMedia={resultMedia} onRetryFailure={onRetryFailure} onCreateVariant={onCreateVariant} canvasPath={canvasPath} canvasHandoffAvailable={Boolean(canvasHandoffPath)} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
}

export function StoryboardNextShotCard({ shotNumber, sourceShotNumber, hasDraft, compactLayout, onCancel }: { shotNumber: number; sourceShotNumber?: number; hasDraft: boolean; compactLayout: boolean; onCancel: () => void }) {
    return (
        <article className="storyboard-workbench-card is-next">
            <header className="storyboard-workbench-card-head">
                <div className="storyboard-workbench-card-heading">
                    <span className="storyboard-workbench-card-shot">
                        <span className="storyboard-workbench-card-shot-index">SC.{String(shotNumber).padStart(2, "0")}</span>下一镜 {shotNumber}
                    </span>
                    <span className="storyboard-workbench-card-state is-draft">
                        <Clapperboard />
                        待撰写
                    </span>
                </div>
                <div className="storyboard-workbench-card-actions">
                    <button type="button" onClick={onCancel}>
                        {compactLayout ? <ChevronDown /> : <X />}
                        {compactLayout ? "收起草稿" : "取消撰写"}
                    </button>
                </div>
            </header>
            <div className="storyboard-workbench-card-body">
                <div className="storyboard-workbench-next-panel">
                    <span className="storyboard-workbench-next-panel-icon">
                        <Clapperboard />
                    </span>
                    <div className="storyboard-workbench-next-panel-copy">
                        <span className="storyboard-workbench-next-kicker">下一镜脚本</span>
                        <strong>{compactLayout ? `SC.${String(shotNumber).padStart(2, "0")} ${hasDraft ? "草稿准备中" : "等待你的脚本"}` : `SC.${String(shotNumber).padStart(2, "0")} 等待你的脚本`}</strong>
                        <span>
                            {compactLayout
                                ? sourceShotNumber
                                    ? `已复用 SC.${String(sourceShotNumber).padStart(2, "0")} 的提示词、参考素材和生成参数。你可以在下方调整，提交后会作为新的 SC.${String(shotNumber).padStart(2, "0")} 加入镜头轨道。`
                                    : `在下方写下这一镜的画面、运镜或故事。提交后会作为 SC.${String(shotNumber).padStart(2, "0")} 加入镜头轨道。`
                                : `在下方写下这一镜的镜头、画面或故事。影策会拆解脚本、设计运镜并渲染成片，这一镜会作为 SC.${String(shotNumber).padStart(2, "0")} 自动加入镜头轨道。`}
                        </span>
                        {compactLayout ? (
                            <div className="storyboard-workbench-next-guide" aria-label="镜头描述建议">
                                <span>主体与动作</span>
                                <span>景别与运镜</span>
                                <span>场景与氛围</span>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </article>
    );
}

function StoryboardBriefAttachments({ attachments }: { attachments: CreationAttachment[] }) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    return (
        <>
            <div className="creation-user-message-attachments storyboard-workbench-brief-attachments">
                {attachments.map((attachment) => {
                    const kind = creationAttachmentKind(attachment);
                    const previewable = kind === "image" || kind === "video";
                    const url = attachment.previewUrl || ("dataUrl" in attachment ? attachment.dataUrl : attachment.url) || "";
                    return (
                        <button
                            key={attachment.id}
                            type="button"
                            className={!previewable ? "is-file" : undefined}
                            onClick={() => {
                                if (!previewable) return;
                                setPreviewType(kind === "video" ? "video" : "image");
                                setPreviewUrl(kind === "video" ? attachment.url || "" : url);
                            }}
                            aria-label={previewable ? `预览 ${attachment.name || "附件"}` : attachment.name || "附件"}
                            disabled={previewable && !url}
                        >
                            {kind === "video" ? (
                                <video src={attachment.url || ""} poster={url !== attachment.url ? url : undefined} muted playsInline preload="metadata" />
                            ) : kind === "image" ? (
                                <img src={url} alt={attachment.name || "附件"} width={44} height={44} loading="lazy" />
                            ) : kind === "audio" ? (
                                <Music2 />
                            ) : (
                                <FileText />
                            )}
                            {previewable ? (
                                <span aria-hidden="true">
                                    <Maximize2 />
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </>
    );
}

function StoryboardShotResult({
    result,
    resultMedia,
    onRetryFailure,
    compactLayout = false,
    onCreateVariant,
    canvasPath,
    canvasHandoffAvailable,
}: {
    result?: CreationMessage;
    resultMedia: CreationResultMediaEntry[];
    onRetryFailure: () => void;
    compactLayout?: boolean;
    onCreateVariant?: () => void;
    canvasPath?: string;
    canvasHandoffAvailable?: boolean;
}) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const openPreview = (url: string, type: "image" | "video") => {
        setPreviewType(type);
        setPreviewUrl(url);
    };
    if (!result)
        return (
            <div className="storyboard-workbench-empty">
                <Film />
                这一镜还没开始——在下方写出你的脚本，我来接手。
            </div>
        );
    const mode = result.mode || "video";
    const status = result.status || "queued";
    const resultUrls = result.resultUrls || [];
    const primaryVideo = resultMedia.find((entry) => entry.kind === "video") || resultMedia[0];
    const primaryVideoUrl = primaryVideo?.url || resultUrls[0];
    const imageResults = resultMedia.filter((entry) => entry.kind === "image");
    if (status === "pending" || status === "queued") {
        const thinking = thinkingFor(mode);
        return (
            <div className="storyboard-workbench-pending" role="status" aria-live="polite" aria-busy="true">
                <div className="storyboard-workbench-thinking">
                    <span className="storyboard-workbench-thinking-copy">
                        <strong>{thinking.title}</strong>
                        <span>{thinking.hint}</span>
                    </span>
                    <span className="storyboard-workbench-pipeline" aria-hidden="true">
                        {thinking.steps.map((step, index) => (
                            <em key={step} style={{ "--step": index } as CSSProperties}>
                                <i>{String(index + 1).padStart(2, "0")}</i>
                                {step}
                            </em>
                        ))}
                    </span>
                </div>
            </div>
        );
    }
    if (status === "error")
        return (
            <div className="storyboard-workbench-error" role="alert">
                <span>{generationErrorMessage(result.error || "")}</span>
                <button type="button" onClick={onRetryFailure}>
                    <RefreshCw />
                    重新生成
                </button>
            </div>
        );
    if (status === "cancelled")
        return (
            <div className="storyboard-workbench-error is-cancelled" role="alert">
                <span>{result.content || "已停止"}</span>
                <button type="button" onClick={onRetryFailure}>
                    <RefreshCw />
                    重新生成
                </button>
            </div>
        );
    if (mode === "text") return <div className="creation-message-content storyboard-workbench-text">{result.content ? <AIMessageMarkdown isStreaming={status === "streaming"}>{result.content}</AIMessageMarkdown> : <span>正在生成…</span>}</div>;
    if (!resultUrls.length)
        return (
            <div className="storyboard-workbench-empty" role="status">
                <Film />
                没有返回可预览结果{" "}
                <button type="button" onClick={onRetryFailure}>
                    重试
                </button>
            </div>
        );
    const note = result.settings ? directorNoteFor(mode, result.settings) : "";
    return (
        <>
            {mode === "video" ? (
                <>
                    <button
                        type="button"
                        className="creation-video-result"
                        style={{ aspectRatio: creationMediaAspectRatio(result.settings?.ratio, "video") }}
                        onClick={() => openPreview(primaryVideoUrl, "video")}
                        aria-label="预览生成视频"
                    >
                        <video muted preload="metadata" className="size-full object-cover" src={primaryVideoUrl} />
                        <span>
                            <Maximize2 />
                            预览视频
                        </span>
                    </button>
                    <CreationVideoSupplementalImages results={imageResults} onPreview={(url) => openPreview(url, "image")} />
                </>
            ) : compactLayout ? (
                <div className="storyboard-editor-image-gallery">
                    {imageResults[0] ? (
                        <button
                            type="button"
                            className="storyboard-editor-image-primary"
                            style={{ aspectRatio: creationMediaAspectRatio(result.settings?.ratio, "image") }}
                            onClick={() => openPreview(imageResults[0].url, "image")}
                            aria-label="预览生成图片 1"
                        >
                            <img src={imageResults[0].url} alt="生成结果 1" />
                            <span>
                                <Maximize2 />
                                查看大图
                            </span>
                        </button>
                    ) : null}
                    {imageResults.length > 1 ? (
                        <div className="storyboard-editor-image-strip" aria-label="其他生成图片">
                            {imageResults.slice(1).map((entry, index) => (
                                <button key={entry.url} type="button" onClick={() => openPreview(entry.url, "image")} aria-label={`预览生成图片 ${index + 2}`}>
                                    <img src={entry.url} alt={`生成结果 ${index + 2}`} />
                                    <span>{String(index + 2).padStart(2, "0")}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="creation-image-result-grid">
                    {imageResults.map((entry) => (
                        <button key={entry.url} type="button" className="creation-image-result" onClick={() => openPreview(entry.url, "image")} aria-label="预览生成图片">
                            <img src={entry.url} alt="生成结果" />
                            <span>
                                <Maximize2 />
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {!compactLayout ? (
                <>
                    {note ? (
                        <p className="storyboard-workbench-director-note">
                            <span>导演手记</span>
                            {note}
                        </p>
                    ) : null}
                    <div className="storyboard-workbench-media-meta">
                        <span>{mode === "video" ? (imageResults.some((entry) => entry.role === "last_frame") ? "视频结果 · 含尾帧" : "视频结果") : `${imageResults.length} 张图片`}</span>
                        <button type="button" onClick={onCreateVariant}>
                            <RefreshCw />
                            生成变体
                        </button>
                        <Link to={canvasPath || "/canvas"}>{canvasHandoffAvailable ? "添加到画布" : "打开画布"}</Link>
                        <CreationResultDownloads results={resultMedia} />
                    </div>
                </>
            ) : null}
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </>
    );
}

