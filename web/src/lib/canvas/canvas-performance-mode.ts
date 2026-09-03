import { CanvasNodeType, type CanvasMediaPerformanceMode, type CanvasNodeData } from "@/types/canvas";

const STORAGE_KEY = "canvas-media-performance-mode";

export type CanvasMediaPerformanceContext = {
    viewportScale?: number;
    visibleNodes?: readonly CanvasNodeData[];
};

export type CanvasMediaRenderTier = "quality" | "balanced" | "lightweight";

export type CanvasMediaRenderPolicy = {
    mode: CanvasMediaPerformanceMode;
    tier: CanvasMediaRenderTier;
    reduceEffects: boolean;
    preferImagePreview: boolean;
    posterMaxWidth: number;
    posterQuality: number;
    posterConcurrency: number;
};

export const CANVAS_MEDIA_MODE_PRESENTATION: Record<CanvasMediaPerformanceMode, { label: string; shortLabel: string; description: string }> = {
    auto: { label: "智能模式", shortLabel: "智能", description: "根据缩放和素材密度自动平衡清晰度与流畅度" },
    quality: { label: "画质优先", shortLabel: "画质", description: "使用原图和高清封面，保留完整视觉效果" },
    performance: { label: "性能优先", shortLabel: "性能", description: "使用轻量封面并减少动画，适合大型多视频画布" },
};

export const CANVAS_MEDIA_TIER_LABEL: Record<CanvasMediaRenderTier, string> = {
    quality: "高清展示",
    balanced: "均衡展示",
    lightweight: "轻量展示",
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

export function shouldMountCanvasVideoPlayer(context: CanvasNodeMediaEffectsContext) {
    return !context.forced && context.selected && context.selectionSize === 1;
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
    return resolveCanvasMediaRenderPolicy(mode, nodes, context).reduceEffects;
}

export function resolveCanvasMediaRenderPolicy(
    mode: CanvasMediaPerformanceMode,
    nodes: readonly CanvasNodeData[],
    context: CanvasMediaPerformanceContext = {},
): CanvasMediaRenderPolicy {
    if (mode === "performance") {
        return { mode, tier: "lightweight", reduceEffects: true, preferImagePreview: true, posterMaxWidth: 480, posterQuality: 0.72, posterConcurrency: 1 };
    }
    if (mode === "quality") {
        return { mode, tier: "quality", reduceEffects: false, preferImagePreview: false, posterMaxWidth: 1280, posterQuality: 0.9, posterConcurrency: 2 };
    }

    const reduceEffects = shouldAutoReduceCanvasMediaEffects(nodes, context);
    return reduceEffects
        ? { mode, tier: "lightweight", reduceEffects: true, preferImagePreview: true, posterMaxWidth: 640, posterQuality: 0.78, posterConcurrency: 1 }
        : { mode, tier: "balanced", reduceEffects: false, preferImagePreview: false, posterMaxWidth: 960, posterQuality: 0.84, posterConcurrency: 1 };
}

function shouldAutoReduceCanvasMediaEffects(nodes: readonly CanvasNodeData[], context: CanvasMediaPerformanceContext) {

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
