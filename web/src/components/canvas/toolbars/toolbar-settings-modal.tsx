import { useCanvasTheme } from "@/components/canvas/canvas-theme-provider";
import { Modal, Switch } from "antd";
import { GripVertical, RotateCcw, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { defaultToolbarPrefs, getToolbarTools, normalizeToolbarPrefs, persistToolbarPrefs, readToolbarPrefs, type ToolbarId, type ToolbarPrefs, type ToolContext, type ToolDefinition } from "@/lib/canvas/tool-registry";

type ToolbarSettingsModalProps = {
    open: boolean;
    onClose: () => void;
    toolbar: ToolbarId;
};

/** 设置面板用的最小化上下文——仅用于解析工具的 label/icon */
const settingsMockContext: ToolContext = {
    selectedCount: 0,
    selectedNodeTypes: new Set(),
    selectedVideoCount: 0,
    canvasTool: "move",
    workspaceMode: "professional",
    isProjectLinked: false,
    canUndo: false,
    canRedo: false,
    extractingVideoFrames: false,
    extractingAudio: false,
    trimmingVideo: false,
    mergingVideos: false,
    addPanelOpen: false,
    appearancePanelOpen: false,
    settingsPanelOpen: false,
    handlers: {} as ToolContext["handlers"],
};

type SettingsItem = {
    id: string;
    label: string;
    icon: React.ReactNode;
    visible: boolean;
    hideable: boolean;
};

export function ToolbarSettingsModal({ open, onClose, toolbar }: ToolbarSettingsModalProps) {
    const theme = useCanvasTheme();
    const reducedMotion = useReducedMotion();
    const [items, setItems] = useState<SettingsItem[]>([]);
    const [toolbarId, setToolbarId] = useState<ToolbarId>(toolbar);
    const draggedItemIdRef = useRef<string | null>(null);
    const dragTargetIdRef = useRef<string | null>(null);
    const dragStartItemsRef = useRef<SettingsItem[] | null>(null);
    const dragCommittedRef = useRef(false);
    const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
    const visibleCount = items.filter((item) => item.visible).length;

    // 当 modal 打开或 toolbar 变化时，加载工具列表与偏好
    useEffect(() => {
        if (!open) return;
        setToolbarId(toolbar);
        const tools = getToolbarTools(toolbar);
        const prefs = normalizeToolbarPrefs(toolbar, readToolbarPrefs(toolbar));
        const hiddenSet = new Set(prefs.hidden);
        const orderIndex = new Map(prefs.order.map((id, index) => [id, index]));
        const sorted = [...tools].sort((a, b) => {
            const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
            if (ai !== bi) return ai - bi;
            return a.defaultOrder - b.defaultOrder;
        });
        setItems(sorted.map((tool) => ({
            id: tool.id,
            label: resolveLabel(tool, settingsMockContext),
            icon: resolveIcon(tool, settingsMockContext),
            visible: tool.hideable === false || !hiddenSet.has(tool.id),
            hideable: tool.hideable !== false,
        })));
    }, [open, toolbar]);

    const handleDragStart = (id: string) => {
        draggedItemIdRef.current = id;
        dragTargetIdRef.current = id;
        dragStartItemsRef.current = items;
        dragCommittedRef.current = false;
        setDraggedItemId(id);
    };

    const handleDragEnter = (targetId: string) => {
        const sourceId = draggedItemIdRef.current;
        if (!sourceId || dragTargetIdRef.current === targetId) return;
        dragTargetIdRef.current = targetId;

        setItems((current) => {
            const sourceIndex = current.findIndex((item) => item.id === sourceId);
            const targetIndex = current.findIndex((item) => item.id === targetId);
            if (sourceIndex < 0 || targetIndex < 0) return current;

            const next = [...current];
            const [movedItem] = next.splice(sourceIndex, 1);
            next.splice(targetIndex, 0, movedItem);
            return next;
        });
    };

    const handleDrop = () => {
        dragCommittedRef.current = true;
        setItems((current) => {
            persistCurrent(current);
            return current;
        });
    };

    const handleDragEnd = () => {
        if (!dragCommittedRef.current && dragStartItemsRef.current) setItems(dragStartItemsRef.current);
        draggedItemIdRef.current = null;
        dragTargetIdRef.current = null;
        dragStartItemsRef.current = null;
        dragCommittedRef.current = false;
        setDraggedItemId(null);
    };

    const handleToggleVisible = (id: string, visible: boolean) => {
        setItems((prev) => {
            const next = prev.map((item) => item.id === id && item.hideable ? { ...item, visible } : item);
            persistCurrent(next);
            return next;
        });
    };

    const handleMove = (id: string, direction: -1 | 1) => {
        setItems((current) => {
            const index = current.findIndex((item) => item.id === id);
            const targetIndex = index + direction;
            if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
            const next = [...current];
            const [moved] = next.splice(index, 1);
            next.splice(targetIndex, 0, moved);
            persistCurrent(next);
            return next;
        });
    };

    const handleReset = () => {
        const defaults = defaultToolbarPrefs(toolbarId);
        const tools = getToolbarTools(toolbarId);
        const hiddenSet = new Set(defaults.hidden);
        setItems(tools.map((tool) => ({
            id: tool.id,
            label: resolveLabel(tool, settingsMockContext),
            icon: resolveIcon(tool, settingsMockContext),
            visible: tool.hideable === false || !hiddenSet.has(tool.id),
            hideable: tool.hideable !== false,
        })));
        persistToolbarPrefs(toolbarId, defaults);
    };

    const persistCurrent = (currentItems: SettingsItem[]) => {
        const prefs: ToolbarPrefs = {
            order: currentItems.map((item) => item.id),
            hidden: currentItems.filter((item) => item.hideable && !item.visible).map((item) => item.id),
        };
        persistToolbarPrefs(toolbarId, prefs);
    };

    return (
        <Modal
            rootClassName="pc-canvas-overlay pc-canvas-modal pc-canvas-toolbar-settings-modal"
            className="canvas-toolbar-settings-modal"
            open={open}
            onCancel={onClose}
            footer={null}
            closable={false}
            width={680}
            centered
            destroyOnHidden
            styles={{
                container: { padding: 0, background: theme.spatial.elevated, border: 0, boxShadow: "none" },
                body: { padding: 0, background: theme.spatial.elevated },
            }}
        >
            <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
                <div className="min-w-0">
                    <h2 className="text-[var(--fs-heading)] font-semibold leading-none">工具栏设置</h2>
                    <p className="mt-2 text-[var(--fs-caption)] leading-none" style={{ color: theme.node.muted }}>拖动调整顺序，关闭不常用入口</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="grid size-8 shrink-0 place-items-center rounded-[var(--dock-item-radius)] outline-none transition-colors hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-white/8"
                    style={{ color: theme.node.muted, outlineColor: theme.accent.primary }}
                    aria-label="关闭工具栏设置"
                >
                    <X className="size-4" />
                </button>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-1">
                <span className="text-[var(--fs-tiny)] font-medium" style={{ color: theme.node.muted }}>已显示 {visibleCount}/{items.length}</span>
                <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[var(--dock-item-radius)] px-2 text-[var(--fs-tiny)] font-medium outline-none transition-colors hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 dark:hover:bg-white/8"
                    style={{ color: theme.node.muted, outlineColor: theme.accent.primary }}
                    aria-label="恢复默认工具栏设置"
                >
                    <RotateCcw className="size-3" />
                    恢复默认
                </button>
            </div>
            <div className="grid grid-cols-1 gap-2 px-5 pb-5 pt-2 sm:grid-cols-2" aria-label="主工具栏顺序">
                {items.map((item, index) => (
                    <ToolbarSettingsItem
                        key={item.id}
                        item={item}
                        index={index}
                        reducedMotion={Boolean(reducedMotion)}
                        theme={theme}
                        dragging={draggedItemId === item.id}
                        onToggleVisible={handleToggleVisible}
                        onDragStart={handleDragStart}
                        onDragEnter={handleDragEnter}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        onMove={handleMove}
                    />
                ))}
            </div>
        </Modal>
    );
}

function ToolbarSettingsItem({ item, index, reducedMotion, theme, dragging, onToggleVisible, onDragStart, onDragEnter, onDrop, onDragEnd, onMove }: { item: SettingsItem; index: number; reducedMotion: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; dragging: boolean; onToggleVisible: (id: string, visible: boolean) => void; onDragStart: (id: string) => void; onDragEnter: (id: string) => void; onDrop: () => void; onDragEnd: () => void; onMove: (id: string, direction: -1 | 1) => void }) {
    return (
        <motion.div
            layout={!reducedMotion}
            transition={reducedMotion ? { duration: 0 } : undefined}
            className={`canvas-toolbar-settings-card grid min-h-14 min-w-0 grid-cols-[28px_36px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--r-md)] px-3 py-2.5 ${item.visible ? "" : "is-hidden"} ${dragging ? "is-dragging" : ""}`}
            style={{ color: theme.node.text }}
            onDragEnter={() => onDragEnter(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault();
                onDrop();
            }}
        >
            <button
                type="button"
                draggable
                className="grid size-7 touch-none cursor-grab place-items-center rounded-[var(--r-sm)] outline-none opacity-40 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 active:cursor-grabbing"
                style={{ color: theme.node.muted, outlineColor: theme.accent.primary }}
                onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    onDragStart(item.id);
                }}
                onDragEnd={onDragEnd}
                onKeyDown={(event) => {
                    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                    event.preventDefault();
                    onMove(item.id, event.key === "ArrowUp" ? -1 : 1);
                }}
                aria-label={`拖动调整${item.label}顺序`}
                title="拖动排序；键盘可用 Alt + 上/下方向键"
            >
                <GripVertical className="size-4" />
            </button>
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--r-md)]" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>
                <span className="grid size-4 place-items-center [&_svg]:size-4">{item.icon}</span>
            </span>
            <div className="canvas-toolbar-settings-card-content min-w-0">
                <div className="truncate text-[var(--fs-caption)] font-semibold leading-5" title={item.label}>{item.label}</div>
                <div className="text-[var(--fs-micro)] leading-4" style={{ color: theme.node.muted }}>第 {index + 1} 位 · {item.hideable ? (item.visible ? "已显示" : "已隐藏") : "固定保留"}</div>
            </div>
            <Switch size="small" checked={item.visible} disabled={!item.hideable} title={item.hideable ? undefined : "用于恢复其他工具，始终保留"} onChange={(checked) => onToggleVisible(item.id, checked)} aria-label={item.hideable ? `${item.visible ? "隐藏" : "显示"}${item.label}` : `${item.label}始终显示`} />
        </motion.div>
    );
}

function resolveLabel(tool: ToolDefinition, ctx: ToolContext): string {
    return typeof tool.label === "function" ? tool.label(ctx) : tool.label;
}

function resolveIcon(tool: ToolDefinition, ctx: ToolContext): React.ReactNode {
    return typeof tool.icon === "function" ? tool.icon(ctx) : tool.icon;
}
