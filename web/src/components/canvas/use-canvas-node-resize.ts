import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { createCanvasResizeGesture, sameCanvasResizeInput, type CanvasResizeBounds, type CanvasResizeCorner, type CanvasResizeInput } from "@/lib/canvas/canvas-node-resize";
import type { Position } from "@/types/canvas";

export function useCanvasNodeResize(options: CanvasResizeInput & {
    disabled?: boolean;
    onResize: (nodeId: string, width: number, height: number, position?: Position) => void;
}) {
    const latestRef = useRef(options);
    latestRef.current = options;
    const cleanupRef = useRef<((clearPreview: boolean) => void) | null>(null);
    const activeInputRef = useRef<CanvasResizeInput | null>(null);
    const [resizePreview, setResizePreview] = useState<CanvasResizeBounds | null>(null);

    const startResize = useCallback((event: ReactPointerEvent, corner: CanvasResizeCorner) => {
        if (event.button !== 0 || !event.isPrimary || latestRef.current.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        cleanupRef.current?.(true);
        const current = latestRef.current;
        activeInputRef.current = current;
        const pointerId = event.pointerId;
        const target = event.currentTarget;
        const gesture = createCanvasResizeGesture({
            initial: current.bounds,
            start: { x: event.clientX, y: event.clientY },
            scale: Math.max(current.scale, 0.001),
            corner,
            constraints: current.constraints,
            requestFrame: (callback) => window.requestAnimationFrame(callback),
            cancelFrame: (id) => window.cancelAnimationFrame(id),
            preview: setResizePreview,
            commit: (bounds) => {
                const latest = latestRef.current;
                if (latest.nodeId === current.nodeId && !latest.disabled) latest.onResize(current.nodeId, bounds.width, bounds.height, { x: bounds.x, y: bounds.y });
            },
        });
        const release = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", cancelPointer);
            window.removeEventListener("lostpointercapture", cancelPointer);
            window.removeEventListener("blur", cancel);
            window.removeEventListener("keydown", keyDown, true);
            cleanupRef.current = null;
            activeInputRef.current = null;
            target.removeAttribute("data-canvas-resize-active");
            if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
        };
        const move = (next: PointerEvent) => {
            if (next.pointerId !== pointerId) return;
            if (next.buttons === 0) {
                finish(next);
                return;
            }
            gesture.move({ x: next.clientX, y: next.clientY });
        };
        const finish = (next: PointerEvent) => {
            if (next.pointerId !== pointerId) return;
            release();
            gesture.finish({ x: next.clientX, y: next.clientY });
        };
        const cancel = () => {
            release();
            gesture.cancel();
        };
        const cancelPointer = (next: PointerEvent) => {
            if (next.pointerId === pointerId) cancel();
        };
        const keyDown = (next: KeyboardEvent) => {
            const undoOrRedo = (next.metaKey || next.ctrlKey) && !next.altKey && (next.key.toLowerCase() === "z" || next.key.toLowerCase() === "y");
            if (next.key !== "Escape" && !undoOrRedo) return;
            next.preventDefault();
            next.stopImmediatePropagation();
            cancel();
        };
        cleanupRef.current = (clearPreview) => {
            release();
            if (clearPreview) gesture.cancel();
            else gesture.dispose();
        };
        target.setAttribute("data-canvas-resize-active", "true");
        setResizePreview(current.bounds);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", cancelPointer);
        window.addEventListener("lostpointercapture", cancelPointer);
        window.addEventListener("blur", cancel);
        window.addEventListener("keydown", keyDown, true);
        target.setPointerCapture(pointerId);
    }, []);

    useLayoutEffect(() => {
        const active = activeInputRef.current;
        if (active && (options.disabled || !sameCanvasResizeInput(active, options))) cleanupRef.current?.(true);
    });
    useLayoutEffect(() => () => cleanupRef.current?.(false), []);

    return { resizePreview, isResizing: resizePreview !== null, startResize };
}
