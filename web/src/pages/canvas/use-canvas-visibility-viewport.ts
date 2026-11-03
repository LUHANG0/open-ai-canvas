import { useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { subscribeCanvasGraphicsViewportPreview } from "@/lib/canvas/canvas-live-viewport";
import type { ViewportTransform } from "@/types/canvas";

/** Mount newly exposed nodes in the same task as the live transform. Covered
 * motion stays on the asynchronous sampled path; editor state is never committed. */
export function useCanvasVisibilityViewport(viewport: ViewportTransform, containerRef: RefObject<HTMLDivElement | null>, size: { width: number; height: number }, coverageRef: RefObject<((next: ViewportTransform) => boolean) | null>) {
    const [preview, setPreview] = useState<{ base: ViewportTransform; value: ViewportTransform } | null>(null);
    const sampledRef = useRef(viewport);
    useEffect(() => {
        sampledRef.current = viewport;
        const container = containerRef.current;
        if (!container) return;
        return subscribeCanvasGraphicsViewportPreview(container, (next) => {
            // The graphics event is unthrottled. Only an actual mounted-coverage
            // miss during a gesture requires a synchronous React boundary.
            if (container.dataset.canvasViewportInteracting === "true" && coverageRef.current && !coverageRef.current(next)) {
                sampledRef.current = next;
                flushSync(() => setPreview({ base: viewport, value: next }));
                return;
            }
            const previous = sampledRef.current;
            // Compare in screen coordinates, including zoom about an arbitrary anchor.
            const ratio = next.k / previous.k;
            const dx = next.x - previous.x * ratio;
            const dy = next.y - previous.y * ratio;
            const travel = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + size.width * (ratio - 1)), Math.abs(dy + size.height * (ratio - 1)));
            if (travel < 96 && Math.abs(Math.log(ratio)) < 0.08) return;
            sampledRef.current = next;
            setPreview({ base: viewport, value: next });
        });
    }, [containerRef, coverageRef, viewport, size.width, size.height]);
    // A real commit/programmatic navigation always supersedes an older sample synchronously.
    return preview?.base === viewport ? preview.value : viewport;
}
