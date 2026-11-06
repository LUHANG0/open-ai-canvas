export type AgentLauncherPosition = { right: number; bottom: number };
export type AgentLauncherViewport = { width: number; height: number };
export type AgentLauncherGesture = { x: number; y: number; start: AgentLauncherPosition; dragged: boolean };
export type AgentLauncherObstacle = { left: number; top: number; right: number; bottom: number };

export const AGENT_LAUNCHER_POSITION_KEY = "canvas:agent-launcher-position:v1";
export const AGENT_LAUNCHER_SIZE = 76;
const MARGIN = 20; // Includes the label below the orb.
/** 画布编辑器以外的页面和窄屏上，大形象会压住页面右下角的按钮，高度封顶到这个值。 */
export const AGENT_LAUNCHER_COMPACT_AVATAR_HEIGHT = 120;
export const AGENT_LAUNCHER_COMPACT_VIEWPORT_WIDTH = 768;

/** 大形象（Live2D / 动画包）的入口高度：受外观设置、视口和宽高比约束，离开画布编辑器或窄屏时再封顶。 */
export function resolveAgentLauncherAvatarHeight(preferred: number, aspectRatio: number, viewport: AgentLauncherViewport, inCanvasEditor: boolean) {
    const compact = !inCanvasEditor || viewport.width < AGENT_LAUNCHER_COMPACT_VIEWPORT_WIDTH;
    return Math.max(40, Math.min(preferred, viewport.height - 60, (viewport.width - 40) / aspectRatio, compact ? AGENT_LAUNCHER_COMPACT_AVATAR_HEIGHT : Infinity));
}

export function clampAgentLauncherPosition(position: AgentLauncherPosition, viewport: AgentLauncherViewport, size = { width: AGENT_LAUNCHER_SIZE, height: AGENT_LAUNCHER_SIZE }): AgentLauncherPosition {
    const clamp = (value: number, extent: number, dimension: number) => {
        const available = Math.max(0, extent - dimension);
        const margin = Math.min(MARGIN, available / 2);
        return Math.min(Math.max(value, margin), available - margin);
    };
    return { right: clamp(position.right, viewport.width, size.width), bottom: clamp(position.bottom, viewport.height, size.height) };
}

/** 临时避开关键操作区；调用方保留原始偏好，页面变化后可以回到用户选择的位置。 */
export function avoidAgentLauncherOverlap(preferred: AgentLauncherPosition, viewport: AgentLauncherViewport, size: AgentLauncherViewport, obstacles: readonly AgentLauncherObstacle[]): AgentLauncherPosition {
    const position = clampAgentLauncherPosition(preferred, viewport, size);
    // 包括上方收起按钮、悬停缩放和下方名称，另留 12px 间隙。
    const side = 14 + 12;
    const below = 34 + 12;
    const clear = (candidate: AgentLauncherPosition) => {
        const right = viewport.width - candidate.right;
        const bottom = viewport.height - candidate.bottom;
        return obstacles.every((obstacle) => right + side <= obstacle.left || right - size.width - side >= obstacle.right || bottom + below <= obstacle.top || bottom - size.height - side >= obstacle.bottom);
    };
    if (clear(position)) return position;
    const rights = [position.right];
    const bottoms = [position.bottom];
    for (const obstacle of obstacles) {
        rights.push(viewport.width - obstacle.left + side, viewport.width - obstacle.right - size.width - side);
        bottoms.push(viewport.height - obstacle.top + below, viewport.height - obstacle.bottom - size.height - side);
    }
    let best = position;
    let distance = Infinity;
    for (const right of rights) {
        for (const bottom of bottoms) {
            const candidate = clampAgentLauncherPosition({ right, bottom }, viewport, size);
            const nextDistance = (candidate.right - position.right) ** 2 + (candidate.bottom - position.bottom) ** 2;
            if (nextDistance < distance && clear(candidate)) {
                best = candidate;
                distance = nextDistance;
            }
        }
    }
    // 极短视口可能没有完整空位；仍保持入口在屏内，用户可收起或拖动。
    return best;
}

export function restoreAgentLauncherPosition(raw: string | null, viewport: AgentLauncherViewport, size?: AgentLauncherViewport): AgentLauncherPosition {
    if (raw) {
        try {
            const value = JSON.parse(raw);
            if (value && Number.isFinite(value.right) && Number.isFinite(value.bottom)) return clampAgentLauncherPosition(value, viewport, size);
        } catch {
            // Damaged UI preferences must not hide the launcher.
        }
    }
    return clampAgentLauncherPosition({ right: MARGIN, bottom: MARGIN }, viewport, size);
}

export function moveAgentLauncher(gesture: AgentLauncherGesture, x: number, y: number, viewport: AgentLauncherViewport, size?: AgentLauncherViewport) {
    const dx = x - gesture.x;
    const dy = y - gesture.y;
    const dragged = gesture.dragged || Math.hypot(dx, dy) >= 6;
    return {
        dragged,
        position: clampAgentLauncherPosition(dragged ? { right: gesture.start.right - dx, bottom: gesture.start.bottom - dy } : gesture.start, viewport, size),
    };
}
