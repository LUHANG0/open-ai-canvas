import { useCanvasTheme } from "@/components/canvas/canvas-theme-provider";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Switch } from "antd";
import { Check, Eraser, Info, Moon, Palette, Settings2, Sun } from "lucide-react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { FloatingDock } from "@/components/ui/aceternity/floating-dock";
import { SpotlightSurface } from "@/components/ui/aceternity/spotlight-surface";
import type { CanvasCreateCommand } from "@/components/canvas/canvas-create-menu";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import { canvasBackgroundModes, canvasBackgroundPresets, canvasThemes, type CanvasBackgroundMode, type CanvasColorTheme, type CanvasTheme } from "@/lib/canvas-theme";
import { defaultToolbarPrefs, readToolbarPrefs, resolveAddNodeMenuCommands, resolveToolbarEntries, type AddNodeMenuCommand, type ToolContext, type ToolbarHandlers, type ToolbarPrefs } from "@/lib/canvas/tool-registry";
import { useThemeStore } from "@/stores/use-theme-store";
import { usePluginStore } from "@/stores/use-plugin-store";
import type { CanvasNodeTypeId, CanvasToolMode, CanvasWorkspaceMode } from "@/types/canvas";

const CanvasCreateMenu = lazy(() => import("@/components/canvas/canvas-create-menu").then((module) => ({ default: module.CanvasCreateMenu })));
const ToolbarSettingsModal = lazy(() => import("@/components/canvas/toolbars/toolbar-settings-modal").then((module) => ({ default: module.ToolbarSettingsModal })));

export function CanvasToolbar({
    selectedCount,
    workspaceMode,
    rightInset = "var(--canvas-inset-x)",
    canvasTool,
    onToolChange,
    isProjectLinked,
    canUndo,
    canRedo,
    backgroundMode,
    showImageInfo,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onChooseStyle,
    onAddScript,
    onAddFrame,
    onAddFolder,
    onAddDrawing,
    onAddExtensionNode,
    onAddWorkflow,
    onOpenDirector,
    onUndo,
    onRedo,
    onUpload,
    onDelete,
    onClear,
    onDeselect,
    onBackgroundModeChange,
    onShowImageInfoChange,
    onOpenMyAssets,
    onOpenProjectCharacters,
}: {
    selectedCount: number;
    workspaceMode: CanvasWorkspaceMode;
    rightInset?: string | number;
    canvasTool: CanvasToolMode;
    onToolChange: (tool: CanvasToolMode) => void;
    isProjectLinked: boolean;
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onChooseStyle: () => void;
    onAddScript: () => void;
    onAddFrame: () => void;
    onAddFolder: () => void;
    onAddDrawing: () => void;
    onAddExtensionNode: (type: CanvasNodeTypeId) => void;
    onAddWorkflow: () => void;
    onOpenDirector: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onDelete: () => void;
    onClear: () => void;
    onDeselect: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onOpenMyAssets: () => void;
    onOpenProjectCharacters: () => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const colorTheme = useThemeStore((state) => state.theme);
    const installations = usePluginStore((state) => state.installations);
    const pluginStates = usePluginStore((state) => state.pluginStates);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = useCanvasTheme();
    const [addOpen, setAddOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [panelX, setPanelX] = useState(0);
    const [prefs, setPrefs] = useState<ToolbarPrefs | null>(() => readToolbarPrefs("main"));
    const addHoverTimerRef = useRef<number | null>(null);
    const addCloseTimerRef = useRef<number | null>(null);

    const clearAddHoverTimer = () => {
        if (addHoverTimerRef.current === null) return;
        window.clearTimeout(addHoverTimerRef.current);
        addHoverTimerRef.current = null;
    };
    const clearAddCloseTimer = () => {
        if (addCloseTimerRef.current === null) return;
        window.clearTimeout(addCloseTimerRef.current);
        addCloseTimerRef.current = null;
    };
    const keepAddPanelOpen = () => {
        clearAddHoverTimer();
        clearAddCloseTimer();
    };
    const openAddPanelOnHover = (event: ReactMouseEvent<HTMLElement>) => {
        if (window.matchMedia("(pointer: coarse)").matches) return;
        const nextX = getPanelX(dockRef.current, event.currentTarget);
        clearAddCloseTimer();
        clearAddHoverTimer();
        addHoverTimerRef.current = window.setTimeout(() => {
            setPanelX(nextX);
            setAppearanceOpen(false);
            setMoreOpen(false);
            setAddOpen(true);
            addHoverTimerRef.current = null;
        }, 150);
    };
    const closeAddPanelAfterHover = () => {
        clearAddHoverTimer();
        clearAddCloseTimer();
        // 给 Dock 到浮层之间留出足够的安全移动时间，避免指针经过窄间隙时菜单闪退。
        addCloseTimerRef.current = window.setTimeout(() => {
            setAddOpen(false);
            addCloseTimerRef.current = null;
        }, 480);
    };

    // 设置面板关闭后重新读取偏好（用户可能调整了排序/显隐）
    useEffect(() => {
        if (!settingsOpen) setPrefs(readToolbarPrefs("main"));
    }, [settingsOpen]);

    useEffect(() => () => {
        clearAddHoverTimer();
        clearAddCloseTimer();
    }, []);

    const placePanel = (event: ReactMouseEvent<HTMLElement>) => setPanelX(getPanelX(dockRef.current, event.currentTarget));
    const runAddAction = (action: () => void) => {
        action();
        setAddOpen(false);
    };

    // 点击外部关闭浮层面板
    useEffect(() => {
        if (!addOpen && !appearanceOpen && !moreOpen) return;
        const closeFloatingPanels = (event: PointerEvent) => {
            const target = event.target instanceof Node ? event.target : null;
            if (target && rootRef.current?.contains(target)) return;
            setAddOpen(false);
            setAppearanceOpen(false);
            setMoreOpen(false);
        };
        document.addEventListener("pointerdown", closeFloatingPanels, true);
        return () => document.removeEventListener("pointerdown", closeFloatingPanels, true);
    }, [addOpen, appearanceOpen, moreOpen]);

    // 构建 handlers（主工具栏只需要部分回调，其余用 no-op 占位满足类型）
    const handlers: ToolbarHandlers = {
        onToolChange,
        onDeselect,
        onUndo,
        onRedo,
        onClear,
        onAddText,
        onAddImage,
        onAddVideo,
        onAddAudio,
        onAddScript,
        onAddFrame,
        onAddFolder,
        onAddDrawing,
        onAddExtensionNode,
        onAddWorkflow,
        onChooseStyle,
        onOpenDirector,
        onUpload,
        onOpenMyAssets,
        onOpenProjectCharacters,
        onBackgroundModeChange,
        onShowImageInfoChange,
        onToggleAddPanel: (event: ReactMouseEvent<HTMLElement>) => { keepAddPanelOpen(); placePanel(event); setAppearanceOpen(false); setMoreOpen(false); setAddOpen((value) => !value); },
        onToggleAppearancePanel: (event: ReactMouseEvent<HTMLElement>) => { placePanel(event); setAddOpen(false); setMoreOpen(false); setAppearanceOpen((value) => !value); },
        onToggleSettingsPanel: (event: ReactMouseEvent<HTMLElement>) => { placePanel(event); setAddOpen(false); setAppearanceOpen(false); setMoreOpen((value) => !value); },
        onDeleteSelected: onDelete,
        // 以下为多选/节点悬停工具栏回调，主工具栏不使用，用 no-op 占位
        onAlign: () => {}, onArrange: () => {}, onCreateStoryboard: () => {}, onCreateReferenceGroup: () => {}, onBatchConnect: () => {}, onMergeVideos: () => {},
        onNodeInfo: () => {}, onNodeDelete: () => {}, onNodeRetry: () => {}, onNodeEditText: () => {}, onNodeDecreaseFont: () => {}, onNodeIncreaseFont: () => {},
        onNodeToggleDialog: () => {}, onNodeAnnotate: () => {}, onNodeGenerateImage: () => {}, onNodeUpload: () => {}, onNodeDownload: () => {}, onNodeSaveAsset: () => {},
        onNodeMaskEdit: () => {}, onNodeEmotion: () => {}, onNodePortraitTexture: () => {}, onNodeCrop: () => {}, onNodeSplit: () => {}, onNodeUpscale: () => {},
        onNodeSuperResolve: () => {}, onNodeAngle: () => {}, onNodeViewImage: () => {}, onNodeExtractVideoFrames: () => {}, onNodeExtractAudioFromVideo: () => {}, onNodeTrimVideoSegments: () => {}, onNodeSubtitles: () => {}, onNodeTimeline: () => {}, onNodeReversePrompt: () => {},
        onNodeToggleFreeResize: () => {}, onNodeToggleLocked: () => {}, onNodeCopyPrompt: () => {},
    } as ToolbarHandlers;

    const ctx: ToolContext = {
        selectedCount,
        selectedNodeTypes: new Set(),
        selectedVideoCount: 0,
        canvasTool,
        workspaceMode,
        isProjectLinked,
        canUndo,
        canRedo,
        extractingVideoFrames: false,
        extractingAudio: false,
        trimmingVideo: false,
        mergingVideos: false,
        addPanelOpen: addOpen,
        appearancePanelOpen: appearanceOpen,
        settingsPanelOpen: moreOpen,
        handlers,
    };

    const enabledPluginIds = new Set(installations.filter((item) => pluginStates[item.manifest.id]?.effectiveEnabled ?? item.enabled).map((item) => item.manifest.id));

    const items = resolveToolbarEntries("main", ctx, prefs ?? defaultToolbarPrefs("main")).map((item) => item.kind === "separator" || item.id !== "tool-add" ? item : {
        ...item,
        onMouseEnter: openAddPanelOnHover,
        onMouseLeave: closeAddPanelAfterHover,
    });

    // 解析添加节点菜单命令——onClick 绑定到 runAddAction 以在执行后关闭面板
    const addNodeCommands = resolveAddNodeMenuCommands({ ...ctx, enabledPluginIds });
    const toCommand = (cmd: AddNodeMenuCommand): CanvasCreateCommand => ({
        id: cmd.id,
        label: cmd.label,
        icon: cmd.icon,
        badge: cmd.badge,
        section: cmd.section,
        onClick: () => runAddAction(() => cmd.run(ctx)),
    });
    const createCommands = addNodeCommands.map(toCommand);

    return (
        <div
            ref={rootRef}
            data-canvas-no-zoom
            className="pc-canvas-toolbar pointer-events-none absolute bottom-[var(--canvas-inset-y)] left-[var(--canvas-inset-x)] z-[var(--z-toolbar)] flex justify-center transition-[right,bottom] duration-200"
            style={{ right: rightInset }}
            role="toolbar"
            aria-label="画布创作工具"
        >
            <AnimatePresence>
                {addOpen ? (
                    <AddNodeMenu
                        x={panelX}
                        theme={theme}
                        commands={createCommands}
                        onMouseEnter={keepAddPanelOpen}
                        onMouseLeave={closeAddPanelAfterHover}
                    />
                ) : null}
            </AnimatePresence>

            <FloatingDock ref={dockRef} items={items} magnify={false} className="canvas-floating-dock pointer-events-auto min-w-0 max-w-full" style={canvasDockStyle(theme)} />

            <AnimatePresence>
                {appearanceOpen ? (
                    <motion.div initial={{ opacity: 0, scaleY: 0.9, y: 8 }} animate={{ opacity: 1, scaleY: 1, y: 0 }} exit={{ opacity: 0, scaleY: 0.92, y: 6 }} transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }} className="pc-canvas-toolbar__popover pointer-events-auto absolute bottom-[var(--canvas-dock-popover-offset)] z-[var(--dock-z-popover)] w-[292px] max-w-[calc(100vw-24px)]" style={{ left: panelX || "50%", transformOrigin: "bottom center", x: "-50%" }}>
                        <SpotlightSurface spotlightColor={theme.toolbar.itemHover} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0 } }} transition={{ duration: aceternityMotion.duration.instant, ease: aceternityMotion.easing.enter }} className="pc-canvas-panel aceternity-floating-panel overflow-hidden rounded-[var(--panel-radius)] border p-2.5 backdrop-blur-2xl" style={{ background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.toolbar.item }} onWheel={(event) => event.stopPropagation()}>
                            <PanelHeading icon={<Palette className="size-4" />} title="画布外观" subtitle="调整整个创作空间" theme={theme} />
                            <div className="mt-3 text-[var(--fs-micro)] font-semibold uppercase opacity-45">主题模式</div>
                            <div className="mt-1 grid grid-cols-2 gap-1 rounded-[var(--dock-item-radius-labeled)] border p-1" style={{ background: theme.spatial.surface, borderColor: theme.toolbar.border }}>
                                <CanvasThemeButton colorTheme={colorTheme} targetTheme="light" onThemeChange={setTheme}><Sun className="size-3.5" />浅色</CanvasThemeButton>
                                <CanvasThemeButton colorTheme={colorTheme} targetTheme="dark" onThemeChange={setTheme}><Moon className="size-3.5" />深色</CanvasThemeButton>
                            </div>
                            <div className="mt-3 text-[var(--fs-micro)] font-semibold uppercase opacity-45">画布底纹</div>
                            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                                {canvasBackgroundModes.map((mode) => (
                                    <CanvasBackgroundPresetButton
                                        key={mode}
                                        mode={mode}
                                        colorTheme={colorTheme}
                                        active={backgroundMode === mode}
                                        onSelect={onBackgroundModeChange}
                                    />
                                ))}
                            </div>
                            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[var(--dock-item-radius-labeled)] border px-2.5 py-2" style={{ background: theme.spatial.surface, borderColor: theme.toolbar.border }}>
                                <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--fs-tiny)] font-semibold"><Info className="size-3" />图片信息</span>
                                <Switch size="small" aria-label="显示图片信息" checked={showImageInfo} onChange={onShowImageInfoChange} />
                            </div>
                        </SpotlightSurface>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {moreOpen ? (
                    <motion.div initial={{ opacity: 0, scaleY: 0.9, y: 8 }} animate={{ opacity: 1, scaleY: 1, y: 0 }} exit={{ opacity: 0, scaleY: 0.92, y: 6 }} transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }} className="pc-canvas-toolbar__popover pointer-events-auto absolute bottom-[var(--canvas-dock-popover-offset)] z-[var(--dock-z-popover)] w-[244px] max-w-[calc(100vw-24px)]" style={{ left: panelX || "50%", transformOrigin: "bottom center", x: "-50%" }}>
                        <SpotlightSurface spotlightColor={theme.toolbar.itemHover} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0 } }} transition={{ duration: aceternityMotion.duration.instant, ease: aceternityMotion.easing.enter }} className="pc-canvas-panel aceternity-floating-panel overflow-hidden rounded-[var(--panel-radius)] border p-2 backdrop-blur-2xl" style={{ background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.toolbar.item }}>
                            <PanelHeading icon={<Settings2 className="size-4" />} title="更多画布操作" subtitle="低频设置与危险操作" theme={theme} />
                            <div className="mt-2.5 grid gap-1">
                                <button type="button" className="flex items-center gap-2 rounded-[var(--dock-item-radius-labeled)] px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2" onClick={() => { setMoreOpen(false); setSettingsOpen(true); }} aria-label="自定义工具栏">
                                    <Settings2 className="size-3.5" />自定义工具栏
                                </button>
                                <div className="my-0.5 h-px" style={{ background: theme.toolbar.border }} />
                                <button type="button" className="flex items-center gap-2 rounded-[var(--dock-item-radius-labeled)] px-2.5 py-2 text-left text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2" style={{ color: theme.accent.danger }} onClick={() => { setMoreOpen(false); onClear(); }}>
                                    <Eraser className="size-3.5" />清空画布
                                </button>
                            </div>
                        </SpotlightSurface>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {settingsOpen ? (
                <Suspense fallback={<ToolbarSettingsLoading x={panelX} onClose={() => setSettingsOpen(false)} />}>
                    <ToolbarSettingsModal open onClose={() => setSettingsOpen(false)} toolbar="main" />
                </Suspense>
            ) : null}
        </div>
    );
}

function ToolbarSettingsLoading({ x, onClose }: { x: number; onClose: () => void }) {
    return (
        <div
            data-canvas-no-zoom
            className="pc-canvas-toolbar__popover pointer-events-auto absolute bottom-[var(--canvas-dock-popover-offset)] z-[var(--dock-z-popover)] w-[244px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-[var(--panel-radius)] border border-border bg-background/95 p-3 shadow-xl backdrop-blur-xl"
            style={{ left: x || "50%" }}
            role="status"
            aria-live="polite"
        >
            <div className="flex items-center justify-between gap-3 text-xs font-medium text-foreground/65">
                <span>正在加载工具栏设置…</span>
                <button type="button" className="shrink-0 rounded-md px-2 py-1 text-foreground/55 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={onClose}>
                    关闭
                </button>
            </div>
        </div>
    );
}

function CanvasBackgroundPresetButton({ mode, colorTheme, active, onSelect }: { mode: CanvasBackgroundMode; colorTheme: CanvasColorTheme; active: boolean; onSelect: (mode: CanvasBackgroundMode) => void }) {
    const preset = canvasBackgroundPresets[mode];
    const line = preset.line[colorTheme];
    const backgroundImage = mode === "dots"
        ? `radial-gradient(circle, ${line} 1px, transparent 1.2px)`
        : mode === "paper"
            ? `linear-gradient(${line} 1px, transparent 1px)`
            : mode === "blank"
                ? undefined
                : `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`;
    const backgroundSize = mode === "dots" ? "8px 8px" : mode === "paper" ? "12px 12px" : mode === "fine-grid" || mode === "blueprint" ? "8px 8px" : "14px 14px";
    return (
        <button
            type="button"
            className="group relative overflow-hidden rounded-[var(--dock-item-radius-labeled)] border p-1.5 text-left transition-[border-color,transform] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
            style={{ borderColor: active ? canvasThemes[colorTheme].node.text : canvasThemes[colorTheme].toolbar.border }}
            aria-pressed={active}
            aria-label={`画布底纹：${preset.label}`}
            onClick={() => onSelect(mode)}
        >
            <span className="block h-8 rounded-[var(--r-sm)] border" style={{ backgroundColor: preset.surface[colorTheme], backgroundImage, backgroundSize, borderColor: canvasThemes[colorTheme].toolbar.border }} />
            <span className="mt-1.5 flex items-center justify-between gap-1 text-[var(--fs-tiny)] font-semibold">
                <span>{preset.label}</span>
                {active ? <Check className="size-3" /> : null}
            </span>
            <span className="mt-0.5 block truncate text-[var(--fs-micro)]" style={{ color: canvasThemes[colorTheme].node.muted }}>{preset.description}</span>
        </button>
    );
}

function AddNodeMenu({ x, theme, commands, onMouseEnter, onMouseLeave }: {
    x: number;
    theme: CanvasTheme;
    commands: CanvasCreateCommand[];
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}) {
    return (
        <motion.div initial={{ opacity: 0, scaleY: 0.9, y: 8 }} animate={{ opacity: 1, scaleY: 1, y: 0 }} exit={{ opacity: 0, scaleY: 0.92, y: 6 }} transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }} className="pc-canvas-toolbar__popover pointer-events-auto absolute bottom-[var(--canvas-dock-popover-offset)] z-[var(--dock-z-popover)] w-[420px] max-w-[calc(100vw-24px)]" style={{ left: x || "50%", transformOrigin: "bottom center", x: "-50%" }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <SpotlightSurface spotlightColor={theme.toolbar.itemHover} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0 } }} transition={{ duration: aceternityMotion.duration.instant, ease: aceternityMotion.easing.enter }} className="pc-canvas-panel aceternity-floating-panel overflow-hidden rounded-[var(--panel-radius)] border p-2 backdrop-blur-2xl" style={{ background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
                <Suspense fallback={<CanvasCreateMenuLoading />}>
                    <CanvasCreateMenu commands={commands} variant="dock" />
                </Suspense>
            </SpotlightSurface>
        </motion.div>
    );
}

function CanvasCreateMenuLoading() {
    return (
        <div className="pointer-events-none flex min-h-[180px] w-full flex-col gap-3 rounded-[var(--dock-item-radius-labeled)] px-2 py-3" role="status" aria-live="polite">
            <span className="h-3 w-24 animate-pulse rounded-full bg-foreground/[.08]" />
            <span className="h-12 w-full animate-pulse rounded-lg bg-foreground/[.05]" />
            <span className="h-12 w-full animate-pulse rounded-lg bg-foreground/[.04]" />
            <span className="sr-only">正在加载添加节点菜单…</span>
        </div>
    );
}

function PanelHeading({ icon, title, subtitle, theme }: { icon: ReactNode; title: string; subtitle: string; theme: CanvasTheme }) {
    return (
        <div className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-[var(--dock-item-radius)] border opacity-75 [&_svg]:size-3.5" style={{ background: theme.spatial.surface, borderColor: theme.toolbar.border }}>{icon}</span>
            <span className="min-w-0"><span className="block text-xs font-semibold">{title}</span><span className="mt-0.5 block text-[var(--fs-micro)]" style={{ color: theme.node.muted }}>{subtitle}</span></span>
        </div>
    );
}

function CanvasThemeButton({ colorTheme, targetTheme, onThemeChange, children }: { colorTheme: CanvasColorTheme; targetTheme: CanvasColorTheme; onThemeChange: (theme: CanvasColorTheme) => void; children: ReactNode }) {
    const theme = useCanvasTheme();
    const active = colorTheme === targetTheme;
    return (
        <AnimatedThemeToggler
            theme={colorTheme}
            targetTheme={targetTheme}
            onThemeChange={onThemeChange}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-[var(--dock-item-radius)] px-2 text-xs font-semibold transition-colors"
            style={active ? { background: theme.node.text, color: theme.node.panel } : { color: theme.toolbar.item }}
            aria-label={`切换到${targetTheme === "dark" ? "深色" : "浅色"}主题`}
            title={`切换到${targetTheme === "dark" ? "深色" : "浅色"}主题`}
        >
            {children}
        </AnimatedThemeToggler>
    );
}

function getPanelX(dock: HTMLDivElement | null, target: HTMLElement) {
    if (!dock) return 0;
    const rootBox = dock.parentElement?.getBoundingClientRect() || dock.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.left - rootBox.left + box.width / 2;
}
