import { useEffect, useMemo, useState } from "react";
import { Drawer, Tooltip } from "antd";
import { ChevronDown, Clapperboard, Film, History, MessageSquareText, Plus, Search, Trash2, X } from "lucide-react";

import { displayCreationPrompt } from "./creation-references";
import type { CreationConversation, CreationMessage, CreationViewMode } from "./creation-types";
import type { CreationMode } from "./creation-empty-state";

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
                                    <Tooltip title="删除对话">
                                        <button type="button" className="creation-history-delete" aria-label={`删除对话：${conversation.title.trim() || "新创作"}`} onClick={() => onDelete(conversation)}>
                                            <Trash2 />
                                        </button>
                                    </Tooltip>
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

export function CreationViewSwitch({ viewMode, onChange }: { viewMode: CreationViewMode; onChange: (mode: CreationViewMode) => void }) {
    return (
        <div className="creation-view-switch" role="group" aria-label="创作视图">
            <button type="button" aria-pressed={viewMode === "chat"} onClick={() => onChange("chat")}>
                <MessageSquareText />
                连续对话
            </button>
            <button type="button" aria-pressed={viewMode === "storyboard"} onClick={() => onChange("storyboard")}>
                <Clapperboard />
                镜头创作
            </button>
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

export function CreationWorkspaceToolbar({
    viewMode,
    onViewModeChange,
    onNewConversation,
    onOpenHistory,
    storyboard,
}: {
    viewMode: CreationViewMode;
    onViewModeChange: (mode: CreationViewMode) => void;
    onNewConversation: () => void;
    onOpenHistory: () => void;
    storyboard?: CreationWorkspaceStoryboardControls;
}) {
    return (
        <header className="creation-thread-toolbar creation-workspace-toolbar" aria-label={storyboard ? "镜头工具条" : "对话工具条"}>
            <div className="creation-workspace-toolbar-leading">
                {storyboard ? (
                    <Tooltip title={storyboard.timelineOpen ? "收起镜头轨道" : "展开镜头轨道"}>
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
                    </Tooltip>
                ) : null}
            </div>
            <div className="creation-workspace-toolbar-switch">
                <CreationViewSwitch viewMode={viewMode} onChange={onViewModeChange} />
            </div>
            <div className="storyboard-workbench-bar-actions">
                {storyboard ? (
                    <Tooltip title={storyboard.composing ? "收起镜头草稿" : "新增镜头"}>
                        <button type="button" aria-label={storyboard.composing ? "收起镜头草稿" : "新增镜头"} className="storyboard-workbench-bar-action is-primary" onClick={storyboard.composing ? storyboard.onCancelCompose : storyboard.onBeginCompose}>
                            {storyboard.composing ? <ChevronDown /> : <Clapperboard />}
                        </button>
                    </Tooltip>
                ) : null}
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
