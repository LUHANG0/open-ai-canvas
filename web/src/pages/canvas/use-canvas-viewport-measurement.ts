import { useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { isNodeHiddenByCollapsedFrame } from "@/lib/canvas/canvas-frame";
import { isHiddenBatchChild } from "@/lib/canvas/canvas-project-domain";
import { getCanvasNodesBounds, viewportForBounds } from "@/lib/canvas/canvas-viewport";
import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";

export interface CanvasViewportSize {
    width: number;
    height: number;
}

export function resolveInitialCanvasViewport(current: ViewportTransform, size: CanvasViewportSize): ViewportTransform | null {
    if (current.x !== 0 || current.y !== 0 || current.k !== 1) return null;
    return { x: size.width / 2, y: size.height / 2, k: 1 };
}

const NARROW_CANVAS_WIDTH = 640;
const LOW_CANVAS_SCALE = 0.12;
const MIN_VISIBLE_NODE_EDGE = 24;

export function resolveSafeNarrowCanvasViewport(current: ViewportTransform, size: CanvasViewportSize, nodes: CanvasNodeData[]): ViewportTransform | null {
    if (size.width > NARROW_CANVAS_WIDTH || current.k > LOW_CANVAS_SCALE || !nodes.length) return null;

    const visibleNodes = nodes.filter((node) => !isHiddenBatchChild(node, nodes) && !isNodeHiddenByCollapsedFrame(node, nodes));
    if (!visibleNodes.length || visibleNodes.some((node) => canvasNodeHasVisibleArea(node, current, size))) return null;

    const bounds = getCanvasNodesBounds(visibleNodes);
    if (!bounds) return null;
    return viewportForBounds(bounds, size, { padding: 24, maxScale: Math.max(current.k, LOW_CANVAS_SCALE) });
}

function canvasNodeHasVisibleArea(node: CanvasNodeData, viewport: ViewportTransform, size: CanvasViewportSize) {
    const left = node.position.x * viewport.k + viewport.x;
    const top = node.position.y * viewport.k + viewport.y;
    const right = (node.position.x + node.width) * viewport.k + viewport.x;
    const bottom = (node.position.y + node.height) * viewport.k + viewport.y;
    const overlapWidth = Math.max(0, Math.min(size.width, right) - Math.max(0, left));
    const overlapHeight = Math.max(0, Math.min(size.height, bottom) - Math.max(0, top));
    return overlapWidth >= Math.min(MIN_VISIBLE_NODE_EDGE, node.width * viewport.k) && overlapHeight >= Math.min(MIN_VISIBLE_NODE_EDGE, node.height * viewport.k);
}

interface UseCanvasViewportMeasurementOptions {
    projectId: string;
    projectLoaded: boolean;
    containerRef: RefObject<HTMLDivElement | null>;
    nodeCount: number;
    nodesRef: { current: CanvasNodeData[] };
    viewportRef: { current: ViewportTransform };
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
}

export function useCanvasViewportMeasurement({ projectId, projectLoaded, containerRef, nodeCount, nodesRef, viewportRef, setViewport }: UseCanvasViewportMeasurementOptions) {
    const [size, setSize] = useState<CanvasViewportSize>({ width: 1200, height: 720 });
    const didInitialCenterRef = useRef(false);
    const didNarrowSafetyCheckRef = useRef(false);

    useEffect(() => {
        didInitialCenterRef.current = false;
        didNarrowSafetyCheckRef.current = false;
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
            const safeViewport = resolveInitialCanvasViewport(viewportRef.current, nextSize);
            if (!safeViewport) return;
            viewportRef.current = safeViewport;
            setViewport(safeViewport);
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(element);
        return () => resizeObserver.disconnect();
    }, [containerRef, projectLoaded, setViewport, viewportRef]);

    useEffect(() => {
        if (!projectLoaded || !nodeCount || size.width > NARROW_CANVAS_WIDTH || didNarrowSafetyCheckRef.current) return;
        didNarrowSafetyCheckRef.current = true;
        const safeViewport = resolveSafeNarrowCanvasViewport(viewportRef.current, size, nodesRef.current);
        if (!safeViewport) return;
        viewportRef.current = safeViewport;
        setViewport(safeViewport);
    }, [nodeCount, nodesRef, projectLoaded, setViewport, size, viewportRef]);

    return size;
}
