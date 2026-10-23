export type AgentPanelLayout = { left: number; top: number; width: number; height: number };
export type AgentPanelViewport = { width: number; height: number };
export type AgentPanelGesture = "move" | "north" | "west" | "northwest" | "northeast" | "southwest" | "southeast";

export const AGENT_PANEL_LAYOUT_KEY = "canvas:agent-panel-layout:v1";
const MARGIN = 12;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 520;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function clampAgentPanelLayout(layout: AgentPanelLayout, viewport: AgentPanelViewport): AgentPanelLayout {
    const maxWidth = Math.max(1, viewport.width - MARGIN * 2);
    const maxHeight = Math.max(1, viewport.height - MARGIN * 2);
    const width = clamp(layout.width, Math.min(MIN_WIDTH, maxWidth), maxWidth);
    const height = clamp(layout.height, Math.min(MIN_HEIGHT, maxHeight), maxHeight);
    return {
        width,
        height,
        left: clamp(layout.left, MARGIN, Math.max(MARGIN, viewport.width - width - MARGIN)),
        top: clamp(layout.top, MARGIN, Math.max(MARGIN, viewport.height - height - MARGIN)),
    };
}

export function restoreAgentPanelLayout(raw: string | null, viewport: AgentPanelViewport): AgentPanelLayout {
    const fallback = defaultAgentPanelLayout(viewport);
    if (!raw) return clampAgentPanelLayout(fallback, viewport);
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && ["left", "top", "width", "height"].every((key) => typeof (parsed as Record<string, unknown>)[key] === "number" && Number.isFinite((parsed as Record<string, unknown>)[key]))) {
            return clampAgentPanelLayout(parsed as AgentPanelLayout, viewport);
        }
    } catch {
        // UI 偏好损坏不影响对话或服务端数据，恢复可见的默认窗口。
    }
    return clampAgentPanelLayout(fallback, viewport);
}

export function defaultAgentPanelLayout(viewport: AgentPanelViewport): AgentPanelLayout {
    const width = 420;
    const height = 640;
    return clampAgentPanelLayout({ width, height, left: viewport.width - width - MARGIN, top: viewport.height - height - MARGIN }, viewport);
}

export function changeAgentPanelLayout(start: AgentPanelLayout, gesture: AgentPanelGesture, dx: number, dy: number, viewport: AgentPanelViewport): AgentPanelLayout {
    if (gesture === "move") return clampAgentPanelLayout({ ...start, left: start.left + dx, top: start.top + dy }, viewport);
    const minWidth = Math.min(MIN_WIDTH, Math.max(1, viewport.width - MARGIN * 2));
    const minHeight = Math.min(MIN_HEIGHT, Math.max(1, viewport.height - MARGIN * 2));
    const left = gesture.includes("west") ? clamp(start.left + dx, MARGIN, start.left + start.width - minWidth) : start.left;
    const top = gesture.includes("north") ? clamp(start.top + dy, MARGIN, start.top + start.height - minHeight) : start.top;
    const right = gesture.includes("east") ? clamp(start.left + start.width + dx, start.left + minWidth, viewport.width - MARGIN) : start.left + start.width;
    const bottom = gesture.includes("south") ? clamp(start.top + start.height + dy, start.top + minHeight, viewport.height - MARGIN) : start.top + start.height;
    return { left, top, width: right - left, height: bottom - top };
}
