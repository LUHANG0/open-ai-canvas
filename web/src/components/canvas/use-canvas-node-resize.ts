import { useLayoutEffect, useRef, type PointerEvent } from "react";
import type { CanvasNodeData, Position } from "@/types/canvas";
import { getNodeResizeMinSize, shouldKeepAspectRatio } from "@/lib/canvas/node-registry";
import { solveNodeResize, type NodeResizeCorner } from "@/lib/canvas/node-resize-geometry";

type ResizeCallback = (id: string, width: number, height: number, position?: Position) => void;

export function useCanvasNodeResize(node: CanvasNodeData, scale: number, minimumHeight: number | null, onResize: ResizeCallback, readOnly = false) {
    const dispose = useRef<(() => void) | null>(null);
    const latest = useRef(onResize);
    latest.current = onResize;
    const disabled = readOnly || Boolean(node.metadata?.locked);
    useLayoutEffect(() => {
        if (disabled) dispose.current?.();
        return () => dispose.current?.();
    }, [node.id, disabled]);

    return (event: PointerEvent<HTMLElement>, corner: NodeResizeCorner) => {
        event.stopPropagation();
        if (disabled || dispose.current || event.button !== 0 || !(scale > 0) || !Number.isFinite(scale)) return;
        event.preventDefault();
        const target: HTMLElement = event.currentTarget;
        const pointer = event.pointerId;
        const origin = { x: event.clientX, y: event.clientY };
        const previous = { ...origin };
        const minimum = getNodeResizeMinSize(node);
        const snapshot = {
            position: { ...node.position },
            width: node.width,
            height: node.height,
            corner,
            minimumWidth: minimum.width,
            minimumHeight: minimumHeight ?? minimum.height,
            ratio: shouldKeepAspectRatio(node) ? (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1) : undefined,
        };
        const listeners = new AbortController();
        let frame: number | null = null;
        let pending = false;
        let active = true;
        const flush = () => {
            if (!active || !pending) return;
            pending = false;
            const size = solveNodeResize(snapshot, { x: (previous.x - origin.x) / scale, y: (previous.y - origin.y) / scale });
            latest.current(node.id, size.width, size.height, size.position);
        };
        const stop = () => {
            active = false;
            pending = false;
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null;
            listeners.abort();
            if (target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer);
            dispose.current = null;
        };
        const accept = (next: globalThis.PointerEvent) => {
            if (!active || next.pointerId !== pointer || (previous.x === next.clientX && previous.y === next.clientY)) return;
            previous.x = next.clientX;
            previous.y = next.clientY;
            pending = true;
        };
        const move = (next: globalThis.PointerEvent) => {
            accept(next);
            if (!pending || frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                flush();
            });
        };
        const finish = () => {
            try {
                flush();
            } finally {
                stop();
            }
        };
        target.setPointerCapture(pointer);
        target.addEventListener("pointermove", move, { signal: listeners.signal });
        target.addEventListener(
            "pointerup",
            (next) => {
                if (next.pointerId !== pointer) return;
                accept(next);
                finish();
            },
            { signal: listeners.signal },
        );
        target.addEventListener(
            "pointercancel",
            (next) => {
                if (next.pointerId === pointer) finish();
            },
            { signal: listeners.signal },
        );
        target.addEventListener(
            "lostpointercapture",
            (next) => {
                if (next.pointerId === pointer) finish();
            },
            { signal: listeners.signal },
        );
        window.addEventListener("blur", finish, { signal: listeners.signal });
        dispose.current = stop;
    };
}
