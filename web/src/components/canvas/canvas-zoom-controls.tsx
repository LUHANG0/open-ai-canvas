import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Compass, Eye, EyeOff, Focus, HelpCircle, LayoutTemplate, Minus, Plus } from "lucide-react";

import { FloatingDock, type FloatingDockEntry } from "@/components/ui/aceternity/floating-dock";
import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import { canvasThemes } from "@/lib/canvas-theme";
import { subscribeCanvasViewportPreview } from "@/lib/canvas/canvas-live-viewport";
import { canvasBottomRowLayout } from "@/lib/canvas/canvas-overlay-layout";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import "./canvas-toolbar-responsive.css";
import "./canvas-zoom-controls.css";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onFitContent: () => void;
    onAutoArrange?: () => void;
    hideNodeConnections?: boolean;
    onHideNodeConnectionsChange?: (value: boolean) => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
    onOpenShortcuts: () => void;
    containerRef?: RefObject<HTMLDivElement | null>;
};

const QUICK_ZOOM_LEVELS = [0.25, 0.5, 1, 2] as const;
/** 主工具条（canvas-toolbar.tsx）读取这个变量，从整行居中右移（让开左侧轨道、视图控制条，或在停靠 Agent 时两侧等距）。 */
const MAIN_TOOLBAR_SHIFT = "--canvas-main-toolbar-shift";

// Keep React's existing text nodes: replacing children invalidates ancestor :has selectors.
function updateLabelText(element: HTMLSpanElement | null, value: string) {
    const text = element?.firstChild;
    if (text?.nodeType === Node.TEXT_NODE && (text as Text).data !== value) (text as Text).data = value;
}

export function CanvasZoomControls({ scale, onScaleChange, onFitContent, onAutoArrange, hideNodeConnections = false, onHideNodeConnectionsChange, isMiniMapOpen, onToggleMiniMap, onOpenShortcuts, containerRef }: CanvasZoomControlsProps) {
    const theme = canvasThemes[useActiveTheme()];
    const reducedMotion = useReducedMotion();
    const rootRef = useRef<HTMLDivElement>(null);
    const liveScaleRef = useRef(scale);
    const rangeRef = useRef<HTMLInputElement>(null);
    const dockLabelRef = useRef<HTMLSpanElement>(null);
    const panelLabelRef = useRef<HTMLSpanElement>(null);
    const [precisionOpen, setPrecisionOpen] = useState(false);
    const [viewOpen, setViewOpen] = useState(false);

    useLayoutEffect(() => {
        const root = rootRef.current;
        const shell = root?.closest<HTMLElement>(".canvas-workspace-zoom-controls");
        const main = root?.closest("main");
        const toolbar = main?.querySelector<HTMLElement>(".canvas-main-toolbar");
        const dock = toolbar?.querySelector<HTMLElement>(":scope > .canvas-desktop-toolbar");
        if (!root || !shell || !main || !toolbar || !dock) return;
        // 停靠的 Agent 会让工作区让出右侧宽度（user-layout 写 data-agent-docked）；收起或浮窗时 Agent 悬浮在画布上，不占宽度。
        const workspace = main.closest<HTMLElement>(".app-user-workspace");
        // Share one bottom row with the main toolbar, measured from real widths (toolbar preferences, side panels, docked Agent):
        // with a docked Agent the main toolbar is centered in the space right of these controls, so its gaps to them and to the Agent stay even;
        // otherwise it is centered on the canvas like the top bar and only moves right to clear these controls.
        // On the same row this bar has no surface and is shorter than the main toolbar, so align it to the toolbar's middle line.
        const measure = () => {
            // 手机端固定分两排，交还给响应式 CSS；避免残留桌面端的行内定位。
            if (window.innerWidth <= 767) {
                shell.style.removeProperty("bottom");
                toolbar.style.removeProperty(MAIN_TOOLBAR_SHIFT);
                return;
            }
            const container = shell.offsetParent?.getBoundingClientRect();
            // HUD 是同组的兄弟元素，节点数量和跟随按钮也必须参与避让。
            const controls = shell.getBoundingClientRect();
            const bar = dock.getBoundingClientRect();
            if (!container || !bar.width || !bar.height) return;
            // The gap to these controls equals the row's own inset, so both sides of the main toolbar get the same space.
            const layout = canvasBottomRowLayout(controls, toolbar.getBoundingClientRect(), bar.width, parseFloat(getComputedStyle(toolbar).left) || 0, { evenGaps: workspace?.dataset.agentDocked === "true" });
            const bottom = layout.stacked ? "calc(var(--canvas-inset-y) + var(--space-16))" : `${Math.round(container.bottom - (bar.top + bar.height / 2) - controls.height / 2)}px`;
            if (shell.style.bottom !== bottom) shell.style.bottom = bottom;
            const shift = layout.shift ? `${layout.shift}px` : "";
            if (toolbar.style.getPropertyValue(MAIN_TOOLBAR_SHIFT) === shift) return;
            if (shift) toolbar.style.setProperty(MAIN_TOOLBAR_SHIFT, shift);
            else toolbar.style.removeProperty(MAIN_TOOLBAR_SHIFT);
        };
        const resize = new ResizeObserver(measure);
        for (const element of [shell, root, main, toolbar, dock, ...main.querySelectorAll(".canvas-workspace-shell,.canvas-project-sidebar")]) resize.observe(element);
        const state = new MutationObserver(measure);
        state.observe(main, { attributes: true, attributeFilter: ["class"] });
        if (workspace) state.observe(workspace, { attributes: true, attributeFilter: ["data-agent-docked"] });
        window.addEventListener("resize", measure);
        measure();
        return () => { resize.disconnect(); state.disconnect(); window.removeEventListener("resize", measure); shell.style.removeProperty("bottom"); toolbar.style.removeProperty(MAIN_TOOLBAR_SHIFT); };
    }, []);

    useEffect(() => updateScaleDisplay(scale), [scale]);

    useLayoutEffect(() => {
        // Newly mounted controls must catch up with imperative viewport previews.
        updateScaleDisplay(liveScaleRef.current);
    }, [precisionOpen, viewOpen]);

    useEffect(() => {
        const container = containerRef?.current;
        if (!container) return;
        return subscribeCanvasViewportPreview(container, (viewport) => updateScaleDisplay(viewport.k));
    }, [containerRef]);

    useEffect(() => {
        if (!precisionOpen && !viewOpen) return;
        const close = (event: PointerEvent) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) { setPrecisionOpen(false); setViewOpen(false); }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setPrecisionOpen(false);
            setViewOpen(false);
            rootRef.current?.querySelector<HTMLButtonElement>(window.innerWidth <= 767 ? '.canvas-view-trigger button' : '[aria-label="精确缩放"]')?.focus();
        };
        document.addEventListener("pointerdown", close, true);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", close, true);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [precisionOpen, viewOpen]);

    function updateScaleDisplay(nextScale: number) {
        liveScaleRef.current = nextScale;
        const percent = String(Math.round(nextScale * 100));
        if (rangeRef.current) rangeRef.current.value = percent;
        updateLabelText(dockLabelRef.current, percent);
        updateLabelText(panelLabelRef.current, `${percent}%`);
    }

    function commitScale(nextScale: number) {
        const clampedScale = Math.min(2, Math.max(0.05, nextScale));
        updateScaleDisplay(clampedScale);
        onScaleChange(clampedScale);
    }

    const items: FloatingDockEntry[] = [
        { id: "zoom-minimap", label: isMiniMapOpen ? "关闭小地图" : "打开小地图", icon: <Compass />, active: isMiniMapOpen, onClick: onToggleMiniMap },
        { id: "zoom-fit", label: "适应画布", icon: <Focus />, onClick: onFitContent },
        ...(onAutoArrange ? [{ id: "zoom-auto-arrange", label: "自动整理节点", icon: <LayoutTemplate />, onClick: onAutoArrange }] : []),
        ...(onHideNodeConnectionsChange ? [{ id: "zoom-hide-node-connections", label: hideNodeConnections ? "显示全部连线" : "设置隐藏节点连线", icon: hideNodeConnections ? <Eye /> : <EyeOff />, active: hideNodeConnections, onClick: () => onHideNodeConnectionsChange(!hideNodeConnections) }] : []),
        { kind: "separator", id: "zoom-separator" },
        { id: "zoom-out", label: "缩小画布", icon: <Minus />, onClick: () => commitScale(liveScaleRef.current - 0.1) },
        {
            id: "zoom-precision",
            label: "精确缩放",
            wide: true,
            quiet: true,
            icon: <span className="inline-flex h-full items-center justify-center whitespace-nowrap text-[var(--fs-caption)] font-semibold leading-none tabular-nums"><span ref={dockLabelRef}>{Math.round(scale * 100)}</span><span className="ml-px text-[var(--fs-micro)] font-medium leading-none opacity-50">%</span></span>,
            active: precisionOpen,
            onClick: () => { setViewOpen(false); setPrecisionOpen((value) => !value); },
        },
        { id: "zoom-in", label: "放大画布", icon: <Plus />, onClick: () => commitScale(liveScaleRef.current + 0.1) },
        { kind: "separator", id: "help-separator" },
        { id: "zoom-shortcuts", label: "操作与快捷键", icon: <HelpCircle />, onClick: onOpenShortcuts },
    ];

    return (
        <div ref={rootRef} data-canvas-no-zoom className="canvas-zoom-controls relative z-[var(--z-toolbar)]" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <AnimatePresence>
                {precisionOpen ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reducedMotion ? 0 : 0.15 }}
                        className="canvas-zoom-precision aceternity-floating-panel absolute bottom-[var(--canvas-dock-popover-offset)] left-0 w-[220px] overflow-hidden rounded-[var(--panel-radius)] border p-2.5 backdrop-blur-2xl"
                        style={{ background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.node.text, boxShadow: `0 28px 80px ${theme.spatial.shadow}` }}
                    >
                        <div className="absolute inset-x-10 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${theme.spatial.glowStrong}, transparent)` }} />
                        <div className="flex items-center justify-between gap-3">
                            <span>
                                <span className="block text-[var(--fs-tiny)] font-semibold">画布尺度</span>
                                <span className="mt-0.5 block text-[var(--fs-micro)]" style={{ color: theme.node.muted }}>精确控制视野密度</span>
                            </span>
                            <span ref={panelLabelRef} className="rounded-full border px-2 py-0.5 text-[var(--fs-tiny)] font-semibold tabular-nums" style={{ background: theme.spatial.surface, borderColor: theme.toolbar.border, color: theme.accent.primary }}>
                                {`${Math.round(scale * 100)}%`}
                            </span>
                        </div>
                        <input
                            ref={rangeRef}
                            type="range"
                            min="5"
                            max="200"
                            step="1"
                            defaultValue={Math.round(scale * 100)}
                            className="aceternity-zoom-range mt-3 h-4 w-full"
                            style={{ accentColor: theme.accent.primary }}
                            onChange={(event) => commitScale(Number(event.target.value) / 100)}
                            aria-label="精确缩放画布"
                        />
                        <div className="mt-2 grid grid-cols-4 gap-1">
                            {QUICK_ZOOM_LEVELS.map((level) => (
                                <button
                                    key={level}
                                    type="button"
                                    className="h-7 rounded-[var(--dock-item-radius)] border text-[var(--fs-micro)] font-semibold tabular-nums outline-none focus-visible:ring-2"
                                    style={{ background: theme.spatial.surface, borderColor: theme.toolbar.border, color: theme.node.muted }}
                                    onClick={() => commitScale(level)}
                                >
                                    {Math.round(level * 100)}%
                                </button>
                            ))}
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <FloatingDock items={items} className="canvas-floating-dock canvas-desktop-toolbar" style={canvasDockStyle(theme)} ariaLabel="画布视图控制" />
            <FloatingDock items={[{ id: "zoom-view", label: "画布视图", icon: <Compass />, expands: true, active: viewOpen, onClick: () => { setPrecisionOpen(false); setViewOpen((value) => !value); } }]} className="canvas-floating-dock canvas-compact-toolbar canvas-view-trigger" style={canvasDockStyle(theme)} ariaLabel="画布视图入口" />
            {viewOpen ? <div role="region" aria-label="画布视图控制" className="canvas-compact-panel"><FloatingDock items={items.map((item) => item.kind === "separator" || item.kind === "switch" ? item : { ...item, icon: item.id === "zoom-precision" ? <Focus /> : item.icon, onClick: (event) => { item.onClick?.(event); if (item.id !== "zoom-in" && item.id !== "zoom-out") setViewOpen(false); } })} showLabels className="canvas-compact-menu" style={canvasDockStyle(theme)} /></div> : null}
        </div>
    );
}
