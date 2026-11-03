import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import { CANVAS_CONNECTION_STROKE_WIDTH, canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { batchCellAnchor, type BatchScroll } from "@/lib/canvas/canvas-batch-references";
import { canvasConnectionPath, type CanvasConnectionGeometry } from "@/lib/canvas/canvas-connection-geometry";
export { canvasConnectionPath, connectionHandleY, activeConnectionPath } from "@/lib/canvas/canvas-connection-geometry";
import type { CanvasConnection, CanvasDisplayConnection, CanvasNodeData } from "@/types/canvas";
import { useCanvasNodeResizeMotion, useCanvasVisualNode } from "./canvas-node-resize-motion";
import { subscribeCanvasGraphicsViewportPreview, subscribeCanvasNodeDragPreview, type CanvasNodeDragPreview } from "@/lib/canvas/canvas-live-viewport";
import { getCanvasConnectionStrokeHitTester } from "@/lib/canvas/canvas-connection-stroke-hit";

export const ConnectionPath = React.memo(function ConnectionPath({
    connection,
    from: sourceFrom,
    to: sourceTo,
    fromScrollTop = 0,
    toScrollTop = 0,
    fromBatchScroll,
    toBatchScroll,
    active,
    visualMode = "full",
    hideVisual = false,
    hitTarget = true,
    hovered: externalHovered = false,
    onSelect,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    fromScrollTop?: number;
    toScrollTop?: number;
    fromBatchScroll?: BatchScroll;
    toBatchScroll?: BatchScroll;
    active: boolean;
    visualMode?: "full" | "hover-only";
    hideVisual?: boolean;
    hitTarget?: boolean;
    hovered?: boolean;
    onSelect: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
    const theme = canvasThemes[useActiveTheme()];
    const from = useCanvasVisualNode(sourceFrom);
    const to = useCanvasVisualNode(sourceTo);
    const [pointerHovered, setHovered] = useState(false);
    const hovered = pointerHovered || externalHovered;
    const { pathD, startX, startY, endX, endY } = canvasConnectionPath(connection, from, to, fromScrollTop, toScrollTop, fromBatchScroll, toBatchScroll);
    const targetCell = batchCellAnchor(to, connection.toHandleId, toBatchScroll);
    const emphasized = active || hovered;
    const strongContrast = theme.connection.beamContrast === "strong";
    const showVisual = !hideVisual && (visualMode === "full" || hovered || (strongContrast && active));
    const showEmphasis = !hideVisual && emphasized;
    if (!pathD) return null;

    return (
        <g data-connection-visual={!hitTarget ? connection.id : undefined} style={!hitTarget ? { pointerEvents: "none" } : undefined}>
            {targetCell ? <title>{targetCell.label}{targetCell.clipped ? "（位于表格滚动区域外）" : ""}</title> : null}
            {targetCell?.clipped && !hideVisual && emphasized ? <text x={endX + 8} y={endY - 8} fill={theme.node.text} fontSize={12} style={{ pointerEvents: "none" }}>{targetCell.label} · 滚动查看</text> : null}
            {hitTarget ? <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                vectorEffect="non-scaling-stroke"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            /> : null}
            {showVisual ? <path
                d={pathD}
                stroke={strongContrast && emphasized ? theme.connection.emphasisStroke : theme.connection.stroke}
                strokeWidth={CANVAS_CONNECTION_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
                strokeOpacity={0.8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: "none" }}
            /> : null}
            {showVisual ? <>
                <circle cx={startX} cy={startY} r={2.5} fill={emphasized ? theme.connection.beam : theme.connection.stroke} fillOpacity={0.8} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                <circle cx={endX} cy={endY} r={2.5} fill={emphasized ? theme.connection.beam : theme.connection.stroke} fillOpacity={0.8} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
            </> : null}
            {showEmphasis ? <CanvasConnectionBeam pathD={pathD} color={theme.connection.beam} contrast={theme.connection.beamContrast} /> : null}
        </g>
    );
}, (previous, next) => previous.connection === next.connection && previous.from === next.from && previous.to === next.to && previous.active === next.active && previous.visualMode === next.visualMode && previous.hideVisual === next.hideVisual && previous.hitTarget === next.hitTarget && previous.hovered === next.hovered && previous.fromScrollTop === next.fromScrollTop && previous.toScrollTop === next.toScrollTop && previous.fromBatchScroll?.top === next.fromBatchScroll?.top && previous.fromBatchScroll?.left === next.fromBatchScroll?.left && previous.toBatchScroll?.top === next.toBatchScroll?.top && previous.toBatchScroll?.left === next.toBatchScroll?.left);

type ConnectionHitLayerProps = {
    connections: CanvasDisplayConnection[];
    bounds: { left: number; top: number; width: number; height: number };
    scale: number;
    selectedId: string | null;
    relatedIds: Set<string>;
    scriptScrollTopById: Record<string, number>;
    batchScrollById?: Record<string, BatchScroll>;
    hideVisual: boolean;
    onSelect: (id: string) => void;
    onContextMenu: (event: ReactMouseEvent<SVGPathElement>, id: string) => void;
};
type HitEntry = CanvasDisplayConnection & { id: string; geometry: CanvasConnectionGeometry };
const HIT_BATCH_SIZE = 64;

/** Passive curves share native hit paths. Only emphasized edges mount SVG
 * visuals; ordinary lines remain in the retained Leafer scene. */
export const CanvasConnectionHitLayer = React.memo(function CanvasConnectionHitLayer(props: ConnectionHitLayerProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const motion = useCanvasNodeResizeMotion();
    const [, refreshVisual] = useState(0);
    const dragPreview = useRef<CanvasNodeDragPreview | null>(null);
    const batchPaths = useRef<SVGPathElement[]>([]);
    const individualPaths = useRef<Map<string, SVGPathElement> | null>(null);
    const refreshHover = useRef<(() => void) | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const pointer = useRef<{ x: number; y: number } | null>(null);
    const liveScale = useRef(props.scale);
    const hitPaths = useRef<SVGPathElement[]>([]);
    const syncHitWidth = useCallback((scale: number) => {
        liveScale.current = scale;
        const width = String(16 / scale);
        for (const path of hitPaths.current) if (path.getAttribute("stroke-width") !== width) path.setAttribute("stroke-width", width);
    }, []);
    useLayoutEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        hitPaths.current = Array.from(svg.querySelectorAll<SVGPathElement>("[data-connection-batch], [data-connection-id]"));
        batchPaths.current = Array.from(svg.querySelectorAll<SVGPathElement>("[data-connection-batch]"));
        individualPaths.current = new Map(hitPaths.current.filter(path => path.hasAttribute("data-connection-id")).map(path => [path.getAttribute("data-connection-id")!, path]));
        const container = svg.closest<HTMLDivElement>("[data-canvas-viewport]");
        // SVG's non-scaling-stroke does not cancel the outer CSS world scale.
        // Update only the hit paths, not an inherited variable on every node.
        if (container?.dataset.canvasViewportInteracting !== "true") liveScale.current = props.scale;
        syncHitWidth(liveScale.current);
    });
    const tester = getCanvasConnectionStrokeHitTester();
    const resolveEntry = useCallback((item: CanvasDisplayConnection, preview: CanvasNodeDragPreview | null): HitEntry => {
        const resolve = (node: CanvasNodeData) => {
            const visual = motion?.resolveNode(node) || node;
            return preview?.nodeIds.has(node.id) ? { ...visual, position: { x: visual.position.x + preview.x, y: visual.position.y + preview.y } } : visual;
        };
        const from = resolve(item.from), to = resolve(item.to);
        return { ...item, from, to, id: item.connection.id, geometry: canvasConnectionPath(item.connection, from, to, props.scriptScrollTopById[from.id] || 0, props.scriptScrollTopById[to.id] || 0, props.batchScrollById?.[from.id], props.batchScrollById?.[to.id]) };
    }, [motion, props.scriptScrollTopById, props.batchScrollById]);
    const entries = useMemo(() => props.connections.map(item => resolveEntry(item, dragPreview.current)), [props.connections, resolveEntry]);
    const indicesByNode = useMemo(() => {
        const result = new Map<string, Set<number>>();
        props.connections.forEach((item, index) => {
            for (const id of [item.from.id, item.to.id]) {
                let indices = result.get(id);
                if (!indices) { indices = new Set(); result.set(id, indices); }
                indices.add(index);
            }
        });
        return result;
    }, [props.connections]);
    const batches = useMemo(() => {
        const result: { entries: HitEntry[]; pathD: string; ids: string }[] = [];
        for (let index = 0; index < entries.length; index += HIT_BATCH_SIZE) {
            const batch = entries.slice(index, index + HIT_BATCH_SIZE);
            result.push({ entries: batch, pathD: batch.map(item => item.geometry.pathD).join(" "), ids: JSON.stringify(batch.map(item => item.id)) });
        }
        return result;
    }, [entries]);
    useLayoutEffect(() => {
        const container = svgRef.current?.closest<HTMLDivElement>("[data-canvas-viewport]");
        if (!container) return;
        const update = (indices: Iterable<number>) => {
            const dirty = new Set<number>();
            let emphasized = false;
            for (const index of indices) {
                const next = resolveEntry(props.connections[index], dragPreview.current);
                if (entries[index].geometry === next.geometry) continue;
                entries[index] = next;
                const batchIndex = Math.floor(index / HIT_BATCH_SIZE);
                batches[batchIndex].entries[index % HIT_BATCH_SIZE] = next;
                dirty.add(batchIndex);
                individualPaths.current?.get(next.id)?.setAttribute("d", next.geometry.pathD);
                if (next.id === hoveredId || next.id === props.selectedId || props.relatedIds.has(next.id)) emphasized = true;
            }
            for (const index of dirty) {
                const batch = batches[index];
                batch.pathD = batch.entries.map(item => item.geometry.pathD).join(" ");
                batchPaths.current[index]?.setAttribute("d", batch.pathD);
            }
            if (emphasized && !props.hideVisual) refreshVisual(version => version + 1);
            refreshHover.current?.();
        };
        const unsubscribeResize = motion?.subscribe(id => { const indices = indicesByNode.get(id); if (indices) update(indices); });
        const unsubscribeDrag = subscribeCanvasNodeDragPreview(container, next => {
            const indices = new Set<number>();
            for (const preview of [dragPreview.current, next]) preview?.nodeIds.forEach(id => indicesByNode.get(id)?.forEach(index => indices.add(index)));
            dragPreview.current = next;
            update(indices);
        });
        return () => { unsubscribeResize?.(); unsubscribeDrag(); };
    }, [batches, entries, indicesByNode, motion, resolveEntry, props.connections, props.hideVisual, props.relatedIds, props.selectedId, hoveredId]);
    const pick = useCallback((clientX: number, clientY: number) => {
        const svg = svgRef.current;
        const target = document.elementFromPoint(clientX, clientY)?.closest("[data-connection-batch], [data-connection-id]");
        if (!svg || !target || !svg.contains(target)) return null;
        if (!tester) return target.getAttribute("data-connection-id");
        const batch = batches[Number(target.getAttribute("data-connection-batch"))];
        const matrix = svg.getScreenCTM();
        if (!matrix || !batch) return null;
        const scale = Math.hypot(matrix.a, matrix.b);
        if (!scale) return null;
        const inverse = matrix.inverse();
        return tester.pick(batch.entries, inverse.a * clientX + inverse.c * clientY + inverse.e, inverse.b * clientX + inverse.d * clientY + inverse.f, scale);
    }, [batches, tester]);
    useLayoutEffect(() => {
        const container = svgRef.current?.closest<HTMLDivElement>("[data-canvas-viewport]");
        if (!container) return;
        let frame = 0;
        const refresh = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const point = pointer.current;
                setHoveredId(point && !props.hideVisual ? pick(point.x, point.y) : null);
            });
        };
        const move = (event: PointerEvent) => { pointer.current = { x: event.clientX, y: event.clientY }; refresh(); };
        const leave = () => { pointer.current = null; setHoveredId(null); };
        const out = (event: PointerEvent) => { if (!event.relatedTarget) leave(); };
        document.addEventListener("pointermove", move, true);
        document.addEventListener("pointerout", out, true);
        window.addEventListener("blur", leave);
        const viewportUnsubscribe = subscribeCanvasGraphicsViewportPreview(container, next => { syncHitWidth(next.k); refresh(); });
        refreshHover.current = refresh;
        refresh();
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener("pointermove", move, true);
            document.removeEventListener("pointerout", out, true);
            window.removeEventListener("blur", leave);
            viewportUnsubscribe();
            refreshHover.current = null;
        };
    }, [pick, tester, props.hideVisual, syncHitWidth]);
    const visual = (item: CanvasDisplayConnection, hitTarget: boolean) => <ConnectionPath
        key={item.connection.id} connection={item.connection} from={item.from} to={item.to}
        fromScrollTop={props.scriptScrollTopById[item.from.id] || 0} toScrollTop={props.scriptScrollTopById[item.to.id] || 0}
        fromBatchScroll={props.batchScrollById?.[item.from.id]} toBatchScroll={props.batchScrollById?.[item.to.id]}
        active={props.selectedId === item.connection.id || props.relatedIds.has(item.connection.id)}
        hovered={hoveredId === item.connection.id} hitTarget={hitTarget} visualMode="hover-only" hideVisual={props.hideVisual}
        onSelect={() => props.onSelect(item.connection.id)} onContextMenu={event => props.onContextMenu(event, item.connection.id)} />;
    return <svg ref={svgRef} data-canvas-connection-layer className="absolute overflow-visible"
        viewBox={`${props.bounds.left} ${props.bounds.top} ${props.bounds.width} ${props.bounds.height}`}
        style={{ left: props.bounds.left, top: props.bounds.top, width: props.bounds.width, height: props.bounds.height, pointerEvents: "none", zIndex: 0 }}>
        {tester ? <>
            {batches.map((batch, index) => {
                const hovered = batch.entries.find(item => item.id === hoveredId);
                const cell = hovered && batchCellAnchor(hovered.to, hovered.connection.toHandleId, props.batchScrollById?.[hovered.to.id]);
                return <path key={batch.entries[0].id} data-connection-batch={index} data-connection-ids={batch.ids}
                    d={batch.pathD} stroke="transparent" strokeWidth={16 / props.scale} vectorEffect="non-scaling-stroke" fill="none"
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onClick={event => { const id = pick(event.clientX, event.clientY); if (id) { event.stopPropagation(); props.onSelect(id); } }}
                    onContextMenu={event => { const id = pick(event.clientX, event.clientY); if (id) { event.preventDefault(); event.stopPropagation(); props.onContextMenu(event, id); } }}>
                    {cell ? <title>{cell.label}{cell.clipped ? "（位于表格滚动区域外）" : ""}</title> : null}
                </path>;
            })}
            {entries.filter(item => item.id === hoveredId || item.id === props.selectedId || props.relatedIds.has(item.id)).map(item => visual(item, false))}
        </> : entries.map(item => visual(item, true))}
    </svg>;
}, (previous, next) => previous.scale === next.scale && previous.bounds.left === next.bounds.left && previous.bounds.top === next.bounds.top && previous.bounds.width === next.bounds.width && previous.bounds.height === next.bounds.height && previous.selectedId === next.selectedId && previous.relatedIds === next.relatedIds && previous.scriptScrollTopById === next.scriptScrollTopById && previous.batchScrollById === next.batchScrollById && previous.hideVisual === next.hideVisual && previous.onSelect === next.onSelect && previous.onContextMenu === next.onContextMenu && (previous.connections === next.connections || (previous.connections.length === next.connections.length && previous.connections.every((item, index) => {
    const other = next.connections[index];
    return item.connection === other.connection && item.from === other.from && item.to === other.to;
}))));

const BEAM_LAYERS = [0.35, 0.6, 0.9, 1.2, CANVAS_CONNECTION_STROKE_WIDTH, 1.65, 1.9, 2.1].map((width, index) => ({
    length: 36 - index * 4,
    offset: -index * 4,
    width,
    opacity: 0.14 + index * 0.07,
}));

const LIGHT_BEAM_LAYERS = [0.65, 0.9, 1.2, 1.5, 1.75, 2.05, 2.35, 2.65].map((width, index) => ({
    ...BEAM_LAYERS[index],
    width,
    opacity: Number((0.24 + index * 0.1).toFixed(2)),
}));

export function CanvasConnectionBeam({ pathD, color, contrast }: { pathD: string; color: string; contrast: "normal" | "strong" }) {
    // 前缘对齐，靠近头部的短层逐渐加宽、加深，形成圆头细尾的水滴轮廓。
    // 各层都沿原曲线行进，转弯时尾部自然贴线，底线宽度不受影响。
    // 统一周期为路径的三分之一，循环无跳帧；动画由 CSS 驱动，不逐帧更新 React。
    return <g data-connection-beam aria-hidden="true" style={{ pointerEvents: "none" }}>
        {(contrast === "strong" ? LIGHT_BEAM_LAYERS : BEAM_LAYERS).map(({ length, offset, width, opacity }) => <path
            key={length}
            className="canvas-connection-comet"
            d={pathD}
            pathLength={300}
            stroke={color}
            strokeWidth={width}
            strokeOpacity={opacity}
            strokeDasharray={`${length} ${100 - length}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="none"
            style={{ "--canvas-beam-offset": `${offset}px`, strokeWidth: `calc(${width}px / var(--canvas-committed-scale, 1))` } as CSSProperties}
        />)}
    </g>;
}
