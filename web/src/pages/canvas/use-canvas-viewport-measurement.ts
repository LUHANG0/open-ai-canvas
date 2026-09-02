import { useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ViewportTransform } from "@/types/canvas";

export interface CanvasViewportSize {
    width: number;
    height: number;
}

export function resolveInitialCanvasViewport(current: ViewportTransform, size: CanvasViewportSize): ViewportTransform | null {
    if (current.x !== 0 || current.y !== 0 || current.k !== 1) return null;
    return { x: size.width / 2, y: size.height / 2, k: 1 };
}

interface UseCanvasViewportMeasurementOptions {
    projectId: string;
    projectLoaded: boolean;
    containerRef: RefObject<HTMLDivElement | null>;
    viewportRef: { current: ViewportTransform };
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
}

export function useCanvasViewportMeasurement({ projectId, projectLoaded, containerRef, viewportRef, setViewport }: UseCanvasViewportMeasurementOptions) {
    const [size, setSize] = useState<CanvasViewportSize>({ width: 1200, height: 720 });
    const didInitialCenterRef = useRef(false);

    useEffect(() => {
        didInitialCenterRef.current = false;
    }, [projectId]);

    useEffect(() => {
        if (!projectLoaded) return;
        const element = containerRef.current;
        if (!element) return;

        const updateSize = () => {
            const rect = element.getBoundingClientRect();
            const nextSize = { width: rect.width, height: rect.height };
            setSize((current) => (current.width === nextSize.width && current.height === nextSize.height ? current : nextSize));
            if (didInitialCenterRef.current) return;

            didInitialCenterRef.current = true;
            const centered = resolveInitialCanvasViewport(viewportRef.current, nextSize);
            if (!centered) return;
            viewportRef.current = centered;
            setViewport(centered);
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(element);
        return () => resizeObserver.disconnect();
    }, [containerRef, projectLoaded, setViewport, viewportRef]);

    return size;
}
