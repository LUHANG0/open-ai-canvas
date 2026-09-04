import type { Position } from "@/types/canvas";

export type CanvasResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CanvasResizeBounds = Position & { width: number; height: number };
export type CanvasResizeConstraints = {
    minWidth: number;
    minHeight: number;
    aspectRatio?: number;
    contentBounds?: { left: number; top: number; right: number; bottom: number } | null;
};
export type CanvasResizeInput = {
    nodeId: string;
    bounds: CanvasResizeBounds;
    scale: number;
    constraints: CanvasResizeConstraints;
};

export function sameCanvasResizeInput(left: CanvasResizeInput, right: CanvasResizeInput) {
    const leftContent = left.constraints.contentBounds;
    const rightContent = right.constraints.contentBounds;
    return left.nodeId === right.nodeId && left.scale === right.scale && sameBounds(left.bounds, right.bounds)
        && left.constraints.minWidth === right.constraints.minWidth && left.constraints.minHeight === right.constraints.minHeight
        && left.constraints.aspectRatio === right.constraints.aspectRatio
        && leftContent?.left === rightContent?.left && leftContent?.top === rightContent?.top
        && leftContent?.right === rightContent?.right && leftContent?.bottom === rightContent?.bottom;
}

export function calculateCanvasResizeBounds(initial: CanvasResizeBounds, offset: Position, corner: CanvasResizeCorner, constraints: CanvasResizeConstraints): CanvasResizeBounds {
    const fromLeft = corner.includes("left");
    const fromTop = corner.includes("top");
    let width = Math.max(constraints.minWidth, initial.width + (fromLeft ? -offset.x : offset.x));
    let height = Math.max(constraints.minHeight, initial.height + (fromTop ? -offset.y : offset.y));
    const ratio = constraints.aspectRatio;
    if (ratio && Number.isFinite(ratio) && ratio > 0) {
        if (Math.abs(offset.x) >= Math.abs(offset.y)) height = width / ratio;
        else width = height * ratio;
        if (height < constraints.minHeight) {
            height = constraints.minHeight;
            width = height * ratio;
        }
        if (width < constraints.minWidth) {
            width = constraints.minWidth;
            height = width / ratio;
        }
    }

    let left = fromLeft ? initial.x + initial.width - width : initial.x;
    let top = fromTop ? initial.y + initial.height - height : initial.y;
    let right = left + width;
    let bottom = top + height;
    const content = constraints.contentBounds;
    if (content) {
        if (fromLeft) left = Math.min(left, content.left);
        else right = Math.max(right, content.right);
        if (fromTop) top = Math.min(top, content.top);
        else bottom = Math.max(bottom, content.bottom);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
}

function sameBounds(left: CanvasResizeBounds, right: CanvasResizeBounds) {
    return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

export function createCanvasResizeGesture(options: {
    initial: CanvasResizeBounds;
    start: Position;
    scale: number;
    corner: CanvasResizeCorner;
    constraints: CanvasResizeConstraints;
    requestFrame: (callback: () => void) => number;
    cancelFrame: (id: number) => void;
    preview: (bounds: CanvasResizeBounds | null) => void;
    commit: (bounds: CanvasResizeBounds) => void;
}) {
    let pendingFrame: number | null = null;
    let latest = options.initial;
    let displayed = options.initial;
    let closed = false;
    const calculate = (point: Position) => {
        // A click on a handle must not normalize dimensions or create history.
        if (point.x === options.start.x && point.y === options.start.y) return options.initial;
        return calculateCanvasResizeBounds(options.initial, { x: (point.x - options.start.x) / options.scale, y: (point.y - options.start.y) / options.scale }, options.corner, options.constraints);
    };
    const close = (clearPreview: boolean) => {
        closed = true;
        if (pendingFrame !== null) options.cancelFrame(pendingFrame);
        pendingFrame = null;
        if (clearPreview) options.preview(null);
    };
    return {
        move(point: Position) {
            if (closed) return;
            latest = calculate(point);
            if (pendingFrame !== null || sameBounds(latest, displayed)) return;
            pendingFrame = options.requestFrame(() => {
                pendingFrame = null;
                if (closed || sameBounds(latest, displayed)) return;
                displayed = latest;
                options.preview(latest);
            });
        },
        finish(point?: Position) {
            if (closed) return;
            if (point) latest = calculate(point);
            close(true);
            if (!sameBounds(latest, options.initial)) options.commit(latest);
        },
        cancel() {
            if (!closed) close(true);
        },
        dispose() {
            if (!closed) close(false);
        },
    };
}
