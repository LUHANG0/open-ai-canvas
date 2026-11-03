import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { CanvasNodeRenderLOD } from "@/lib/canvas/canvas-node-lod";

/** Chrome only. Content LOD, mounted coverage and viewport commits stay immediate. */
export function useCanvasNodeDetailLOD(scope: string, desired: Map<string, CanvasNodeRenderLOD>, containerRef: RefObject<HTMLDivElement | null>) {
    const [snapshot, setSnapshot] = useState(() => ({ scope, lods: new Map(desired) }));
    const admitted = useRef(snapshot);

    useLayoutEffect(() => {
        let cancelled = false;
        let frame = 0;
        const publish = (lods: Map<string, CanvasNodeRenderLOD>) => {
            admitted.current = { scope, lods };
            setSnapshot(admitted.current);
        };
        if (admitted.current.scope !== scope) publish(new Map(desired));
        // Retain only mounted IDs. Static async arrivals preserve their original
        // detail immediately; only gesture-time arrivals wait for chrome.
        let next: Map<string, CanvasNodeRenderLOD> | undefined;
        for (const id of admitted.current.lods.keys()) {
            if (!desired.has(id)) {
                next ??= new Map(admitted.current.lods);
                next.delete(id);
            }
        }
        const interacting = containerRef.current?.dataset.canvasViewportInteracting === "true";
        for (const [id, lod] of desired) {
            if (!admitted.current.lods.has(id)) {
                next ??= new Map(admitted.current.lods);
                next.set(id, interacting ? "preview" : lod);
            }
        }
        if (next) publish(next);
        const pending = () => {
            for (const [id, lod] of desired) if (admitted.current.lods.get(id) !== lod) return true;
            return false;
        };
        const step = () => {
            if (cancelled) return;
            if (containerRef.current?.dataset.canvasViewportInteracting !== "true") {
                publish(new Map(desired));
            }
            // Observe the existing gesture flag only while work is pending. This
            // also ends net-zero gestures that do not change the viewport object.
            if (pending()) frame = requestAnimationFrame(step);
        };
        if (pending()) frame = requestAnimationFrame(step);
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [scope, desired, containerRef]);

    return snapshot.scope === scope ? snapshot.lods : desired;
}
