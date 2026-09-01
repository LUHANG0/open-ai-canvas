import { CanvasNodeType, type CanvasMediaPerformanceMode, type CanvasNodeData } from "@/types/canvas";

const STORAGE_KEY = "canvas-media-performance-mode";

export type CanvasMediaPerformanceContext = {
    viewportScale?: number;
    visibleNodes?: readonly CanvasNodeData[];
};

export type CanvasNodeMediaEffectsContext = {
    selected: boolean;
    selectionSize: number;
    forced?: boolean;
};

export function shouldReduceCanvasNodeMediaEffects(canvasEffectsReduced: boolean, context: CanvasNodeMediaEffectsContext) {
    if (context.forced) return true;
    if (!canvasEffectsReduced) return false;
    // 只有唯一选中的节点恢复完整播放器；框选或全选不能一次挂载整批视频。
    return !(context.selected && context.selectionSize === 1);
}

export function readCanvasMediaPerformanceMode(): CanvasMediaPerformanceMode {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored === "quality" || stored === "performance" ? stored : "auto";
    } catch {
        return "auto";
    }
}

export function persistCanvasMediaPerformanceMode(mode: CanvasMediaPerformanceMode) {
    try {
        window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // 浏览器禁用本地存储时保留当前会话内的选择。
    }
}

export function shouldReduceCanvasMediaEffects(
    mode: CanvasMediaPerformanceMode,
    nodes: readonly CanvasNodeData[],
    context: CanvasMediaPerformanceContext = {},
) {
    if (mode === "performance") return true;
    if (mode === "quality") return false;

    const visibleNodes = context.visibleNodes || nodes;
    const viewportScale = Math.max(0.05, context.viewportScale || 1);
    const mediaCount = countMediaNodes(nodes);
    const visibleMediaCount = countMediaNodes(visibleNodes, true);
    const visibleVideoCount = visibleNodes.filter((node) => node.type === CanvasNodeType.Video && Boolean(node.metadata?.content)).length;

    // 超远景时播放器控件已经无法有效操作，继续挂载反而会放大缩放和侧栏切换的成本。
    const distantVideoView = viewportScale <= 0.36 && visibleVideoCount > 0;
    const denseDistantMediaView = viewportScale <= 0.5 && visibleMediaCount >= 10;
    const denseVisibleMedia = visibleMediaCount >= 18 || visibleVideoCount >= 4;
    const denseVisibleScene = visibleNodes.length >= 48 && visibleMediaCount >= 12;

    return nodes.length >= 80
        || mediaCount >= 32
        || distantVideoView
        || denseDistantMediaView
        || denseVisibleMedia
        || denseVisibleScene;
}

function countMediaNodes(nodes: readonly CanvasNodeData[], contentOnly = false) {
    return nodes.filter((node) => {
        const isMedia = node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio;
        return isMedia && (!contentOnly || Boolean(node.metadata?.content));
    }).length;
}
