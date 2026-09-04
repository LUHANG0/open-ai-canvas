import { useEffect, useMemo, useState } from "react";
import { Drawer } from "antd";
import { Check, Clapperboard, Cloud, CloudOff, Film, History, LoaderCircle, MessageSquareText, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

import type { CreationConversationCloudSyncStatus } from "@/services/creation-conversation-cloud-sync";
import { displayCreationPrompt } from "./creation-references";
import type { CreationConversation, CreationMessage, CreationViewMode } from "./creation-types";
import type { CreationMode } from "./creation-empty-state";
import { CreationTooltip } from "./creation-tooltip";

const historyModeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };
const historyTimeFormatter = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function historyPreviewMessage(conversation: CreationConversation) {
    let fallback: CreationMessage | undefined;
    for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
        const message = conversation.messages[index];
        if (!message.content.trim()) continue;
        fallback ||= message;
        if (message.role === "user") return message;
    }
    return fallback;
}

function formatHistoryTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp) || !timestamp) return "时间未知";
    return historyTimeFormatter.format(timestamp);
}

export function CreationHistoryDrawer({
    open,
    conversations,
    activeId,
    onClose,
    onSelect,
    onDelete,
}: {
    open: boolean;
    conversations: CreationConversation[];
    activeId: string;
    onClose: () => void;
    onSelect: (conversation: CreationConversation) => void;
    onDelete: (conversation: CreationConversation) => void;
}) {
    const [keyword, setKeyword] = useState("");

    useEffect(() => {
        if (open) setKeyword("");
    }, [open]);

    const visibleConversations = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        if (!query) return conversations;
        return conversations.filter((conversation) => {
            const latest = historyPreviewMessage(conversation);
            const searchable = [
                conversation.title,
                ...conversation.messages.flatMap((message) => [message.content, displayCreationPrompt(message.content, message.references || [])]),
                latest?.mode ? historyModeLabels[latest.mode] : "创作",
                formatHistoryTime(conversation.updatedAt),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return searchable.includes(query);
        });
    }, [conversations, keyword]);

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement="right"
            size="min(440px, 100vw)"
            closeIcon={<X className="size-4" />}
            className="creation-history-drawer"
            rootClassName="creation-history-drawer-root"
            styles={{ body: { padding: 0 } }}
            title={
                <div className="creation-history-title">
                    <span>历史对话</span>
                    <small>{conversations.length} 个对话</small>
                </div>
            }
        >
            <div className="creation-history-content">
                <label className="creation-history-search">
                    <Search aria-hidden="true" />
                    <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索对话标题或内容" aria-label="搜索历史对话" />
                </label>
                {visibleConversations.length ? (
                    <ul className="creation-history-list" aria-label="历史对话，按更新时间倒序排列">
                        {visibleConversations.map((conversation) => {
                            const latest = historyPreviewMessage(conversation);
                            const active = conversation.id === activeId;
                            return (
                                <li key={conversation.id} className={active ? "is-active" : undefined}>
                                    <button type="button" className="creation-history-item-main" aria-current={active ? "page" : undefined} onClick={() => onSelect(conversation)}>
                                        <span className="creation-history-time">
                                            <time dateTime={conversation.updatedAt}>{formatHistoryTime(conversation.updatedAt)}</time>
                                            <em>{latest?.mode ? historyModeLabels[latest.mode] : "创作"}</em>
                                        </span>
                                        <strong className="creation-history-item-heading">{conversation.title.trim() || "新创作"}</strong>
                                        <span className="creation-history-snippet">{latest ? displayCreationPrompt(latest.content, latest.references || []).trim() || "还没有开始创作" : "还没有开始创作"}</span>
                                    </button>
                                    <CreationTooltip title="删除对话">
                                        <button type="button" className="creation-history-delete" aria-label={`删除对话：${conversation.title.trim() || "新创作"}`} onClick={() => onDelete(conversation)}>
                                            <Trash2 />
                                        </button>
                                    </CreationTooltip>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="creation-history-empty">{keyword.trim() ? "没有找到匹配的对话" : "暂无历史对话"}</div>
                )}
            </div>
        </Drawer>
    );
}

export function CreationViewSwitch({ viewMode, onChange, desktopLayout = false }: { viewMode: CreationViewMode; onChange: (mode: CreationViewMode) => void; desktopLayout?: boolean }) {
    return (
        <div className="creation-view-switch" role="group" aria-label={desktopLayout ? "工作方式" : "创作视图"}>
            <CreationTooltip title="按对话逐轮生成与调整" placement="bottom">
                <button type="button" aria-label="连续创作" aria-pressed={viewMode === "chat"} onClick={() => onChange("chat")}>
                    <MessageSquareText />
                    连续创作
                </button>
            </CreationTooltip>
            <CreationTooltip title="按镜头组织并生成内容" placement="bottom">
                <button type="button" aria-label="镜头创作" aria-pressed={viewMode === "storyboard"} onClick={() => onChange("storyboard")}>
                    <Clapperboard />
                    镜头创作
                </button>
            </CreationTooltip>
        </div>
    );
}

type CreationWorkspaceStoryboardControls = {
    timelineOpen: boolean;
    count: number;
    composing: boolean;
    onToggleTimeline: () => void;
    onBeginCompose: () => void;
    onCancelCompose: () => void;
};

const creationCloudSyncCopy: Record<CreationConversationCloudSyncStatus, { label: string; title: string }> = {
    hydrating: { label: "正在读取云端", title: "正在读取账号创作历史" },
    pending: { label: "等待同步", title: "修改已保存在本机，正在等待上传" },
    syncing: { label: "正在同步", title: "正在将创作历史写入账号" },
    synced: { label: "已同步", title: "创作历史已同步到当前账号" },
    failed: { label: "同步失败", title: "云同步失败，点击重试；本机副本仍保留" },
    conflict: { label: "需要合并", title: "其他页面同时修改了该对话，点击重新合并" },
};

export function CreationCloudSyncButton({ status, onRetry }: { status: CreationConversationCloudSyncStatus; onRetry: () => void }) {
    const copy = creationCloudSyncCopy[status];
    const busy = status === "hydrating" || status === "syncing";
    const retryable = status === "failed" || status === "conflict" || status === "pending";
    const Icon = busy ? LoaderCircle : status === "synced" ? Check : status === "failed" ? CloudOff : status === "conflict" ? RefreshCw : Cloud;
    return (
        <CreationTooltip title={copy.title} placement="bottom">
            <span className="creation-cloud-sync-tooltip-trigger" role={!retryable ? "status" : undefined} aria-label={!retryable ? copy.title : undefined} tabIndex={!retryable ? 0 : undefined}>
                <button type="button" className={`creation-cloud-sync is-${status}`} aria-label={copy.title} disabled={!retryable} onClick={retryable ? onRetry : undefined} tabIndex={!retryable ? -1 : undefined}>
                    <Icon aria-hidden="true" className={busy ? "animate-spin" : undefined} />
                    <span className="creation-cloud-sync-copy">{copy.label}</span>
                </button>
            </span>
        </CreationTooltip>
    );
}

export function CreationWorkspaceToolbar({
    viewMode,
    onViewModeChange,
    onNewConversation,
    onOpenHistory,
    cloudSyncStatus,
    onRetryCloudSync,
    desktopLayout,
    storyboard,
}: {
    viewMode: CreationViewMode;
    onViewModeChange: (mode: CreationViewMode) => void;
    onNewConversation: () => void;
    onOpenHistory: () => void;
    cloudSyncStatus: CreationConversationCloudSyncStatus;
    onRetryCloudSync: () => void;
    desktopLayout: boolean;
    storyboard?: CreationWorkspaceStoryboardControls;
}) {
    return (
        <header className="creation-thread-toolbar creation-workspace-toolbar" aria-label={storyboard ? "镜头工具条" : "对话工具条"}>
            <div className="creation-workspace-toolbar-leading">
                <CreationCloudSyncButton status={cloudSyncStatus} onRetry={onRetryCloudSync} />
                {storyboard ? (
                    <CreationTooltip title={storyboard.timelineOpen ? "收起镜头轨道" : "展开镜头轨道"} placement="bottom">
                        <button
                            type="button"
                            className={`storyboard-workbench-rail-button${storyboard.timelineOpen ? " is-open" : ""}${storyboard.composing ? " is-draft" : ""}`}
                            aria-expanded={storyboard.timelineOpen}
                            aria-controls={storyboard.timelineOpen && storyboard.count > 0 ? "storyboard-timeline" : undefined}
                            aria-label={`镜头轨道，${storyboard.count} 个镜头${storyboard.composing ? "，1 个草稿" : ""}`}
                            onClick={storyboard.onToggleTimeline}
                        >
                            <Film />
                            <span className="storyboard-workbench-rail-badge">{storyboard.count}</span>
                            {storyboard.composing ? <span className="storyboard-editor-toolbar-draft" aria-hidden="true" /> : null}
                        </button>
                    </CreationTooltip>
                ) : null}
            </div>
            <div className="creation-workspace-toolbar-switch">
                <CreationViewSwitch viewMode={viewMode} onChange={onViewModeChange} desktopLayout={desktopLayout} />
            </div>
            <div className="storyboard-workbench-bar-actions">
                {storyboard ? (
                    <CreationTooltip title={storyboard.composing ? "收起镜头草稿" : "新增镜头"} placement="bottom">
                        <button type="button" aria-label={storyboard.composing ? "收起镜头草稿" : "新增镜头"} className="storyboard-workbench-bar-action is-primary" onClick={storyboard.composing ? storyboard.onCancelCompose : storyboard.onBeginCompose}>
                            {storyboard.composing ? <X /> : <Plus />}
                            {desktopLayout ? <span>{storyboard.composing ? "收起草稿" : "新增镜头"}</span> : null}
                        </button>
                    </CreationTooltip>
                ) : null}
                <CreationTooltip title="开始新的创作对话" placement="bottom">
                    <button type="button" aria-label="新建创作" className="storyboard-workbench-bar-action is-new" onClick={onNewConversation}>
                        <Plus />
                        {desktopLayout ? <span>新建</span> : null}
                    </button>
                </CreationTooltip>
                <CreationTooltip title="查看历史创作对话" placement="bottom">
                    <button type="button" aria-label="查看历史对话" className="storyboard-workbench-bar-action is-history" onClick={onOpenHistory}>
                        <History />
                        {desktopLayout ? <span>历史</span> : null}
                    </button>
                </CreationTooltip>
            </div>
        </header>
    );
}
