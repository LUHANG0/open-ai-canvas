import { useEffect, useId, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { Grip, Minus, Plus, RotateCcw } from "lucide-react";
import { demoConnection, DEMO_HEIGHT, DEMO_WIDTH, initialDemoPoint, zoomDemoAt, type DemoPoint } from "./brand-canvas-geometry";

type View = { zoom: number; pan: DemoPoint | null };
type Drag = { pointer: number; node: number | null; start: DemoPoint; original: DemoPoint; scale: number };
export function BrandCanvasDemo({ items, renderMedia }: { items: { title: string }[]; renderMedia: (item: { title: string }, index: number, active: boolean) => ReactNode }) {
    const viewport = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 1060, height: 540 });
    const [points, setPoints] = useState<Record<number, DemoPoint>>({});
    const [selected, setSelected] = useState(0);
    const [view, setView] = useState<View>({ zoom: 1, pan: null });
    const drag = useRef<Drag | null>(null);
    const height = DEMO_HEIGHT;
    const initialPoint = initialDemoPoint;
    const active = Math.min(selected, Math.max(0, items.length - 1));
    const base = size.width >= 1000 ? Math.min(1, (size.width - 48) / DEMO_WIDTH, (size.height - 32) / height) : .82;
    const scale = base * view.zoom;
    const defaultPan = (nextScale: number): DemoPoint => ({ x: size.width < 1000 ? size.width / 2 - (initialPoint(active).x + 140) * nextScale : (size.width - DEMO_WIDTH * nextScale) / 2, y: size.width >= 1000 ? (size.height - height * nextScale) / 2 : size.height / 2 - (initialPoint(active).y + 150) * nextScale });
    const pan = view.pan || defaultPan(scale);
    const current = useRef({ view, scale, pan, base });
    current.current = { view, scale, pan, base };
    const hint = useId();
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const measure = () => setSize({ width: element.clientWidth || 1060, height: element.clientHeight || 540 });
        measure();
        const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
        observer?.observe(element);
        return () => observer?.disconnect();
    }, []);
    const zoom = (amount: number, at?: DemoPoint) => {
        const state = current.current;
        const nextZoom = Math.max(.6, Math.min(1.6, Math.round((state.view.zoom + amount) * 100) / 100));
        const nextScale = state.base * nextZoom;
        setView({ zoom: nextZoom, pan: zoomDemoAt(state.pan, state.scale, nextScale, at || { x: size.width / 2, y: size.height / 2 }) });
    };
    const zoomRef = useRef(zoom); zoomRef.current = zoom;
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const wheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            const box = element.getBoundingClientRect();
            zoomRef.current(event.deltaY < 0 ? .1 : -.1, { x: event.clientX - box.left, y: event.clientY - box.top });
        };
        element.addEventListener("wheel", wheel, { passive: false });
        return () => element.removeEventListener("wheel", wheel);
    }, []);
    const reset = () => { setPoints({}); setView({ zoom: 1, pan: null }); };
    const choose = (index: number) => {
        setSelected(index);
        if (size.width < 1000) {
            const point = points[index] || initialPoint(index);
            setView((state) => ({ ...state, pan: { x: size.width / 2 - (point.x + 140) * scale, y: size.height / 2 - (point.y + 160) * scale } }));
        }
    };
    const start = (event: ReactPointerEvent<HTMLElement>, index: number | null) => {
        if (event.button !== 0 || drag.current || index === null && event.pointerType === "touch") return;
        event.preventDefault(); event.stopPropagation();
        if (index !== null) { setSelected(index); setView((state) => ({ ...state, pan: current.current.pan })); }
        drag.current = { pointer: event.pointerId, node: index, start: { x: event.clientX, y: event.clientY }, original: index === null ? pan : points[index] || initialPoint(index), scale };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const move = (event: ReactPointerEvent) => {
        const state = drag.current;
        if (!state || state.pointer !== event.pointerId) return;
        const divisor = state.node === null ? 1 : state.scale;
        const next = { x: state.original.x + (event.clientX - state.start.x) / divisor, y: state.original.y + (event.clientY - state.start.y) / divisor };
        if (state.node === null) setView((previous) => ({ ...previous, pan: next }));
        else setPoints((previous) => ({ ...previous, [state.node!]: next }));
    };
    if (!items.length) return null;
    return <div className="mc-workflow mc-demo">
        <div className="mc-demo-choices" aria-label="演示场景">{items.map((item, index) => <button type="button" key={index} aria-pressed={active === index} onClick={() => choose(index)}>{item.title}</button>)}</div>
        <div className="mc-demo-viewport" ref={viewport} aria-label="可交互的品牌画布演示" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("[data-demo-node],button,a,video")) start(event, null); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
            <div className="mc-demo-plane" style={{ width: DEMO_WIDTH, height, transform: `translate3d(${pan.x}px,${pan.y}px,0) scale(${scale})` }}>
                <svg className="mc-demo-connections" width={DEMO_WIDTH} height={height} aria-hidden="true">{items.slice(1).map((_, index) => <path key={index} d={demoConnection(points[0] || initialPoint(0), points[index + 1] || initialPoint(index + 1))} data-active={active === 0 || active === index + 1 || undefined} />)}</svg>
                {items.map((item, index) => { const point = points[index] || initialPoint(index); return <article data-demo-node data-active={active === index || undefined} className="mc-demo-node" key={index} style={{ transform: `translate3d(${point.x}px,${point.y}px,0)` }} onPointerDown={(event) => {
                    if ((event.target as HTMLElement).closest("a,input,textarea,select,video[controls],button:not(.mc-demo-handle)")) return;
                    start(event, index);
                }}>
                    <button type="button" className="mc-demo-handle" aria-label={`移动${item.title}节点`} aria-describedby={hint} onFocus={() => choose(index)} onKeyDown={(event) => {
                        if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
                        if (event.key === "Home") { event.preventDefault(); setPoints((previous) => ({ ...previous, [index]: initialPoint(index) })); return; }
                        const step = event.shiftKey ? 40 : 10;
                        const delta = event.key === "ArrowLeft" ? { x: -step, y: 0 } : event.key === "ArrowRight" ? { x: step, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: -step } : event.key === "ArrowDown" ? { x: 0, y: step } : null;
                        if (!delta) return; event.preventDefault();
                        setPoints((previous) => { const position = previous[index] || initialPoint(index); return { ...previous, [index]: { x: position.x + delta.x, y: position.y + delta.y } }; });
                    }}><span>{item.title}</span><Grip aria-hidden="true" /></button>
                    <figure className="mc-demo-media">{renderMedia(item, index, active === index)}</figure>
                </article>; })}
            </div>
            <div className="mc-demo-toolbar" aria-label="画布演示视图"><button type="button" aria-label="缩小画布演示" disabled={view.zoom <= .6} onClick={() => zoom(-.15)}><Minus aria-hidden="true" /></button><output aria-live="polite" aria-label="画布演示缩放">{Math.round(scale * 100)}%</output><button type="button" aria-label="放大画布演示" disabled={view.zoom >= 1.6} onClick={() => zoom(.15)}><Plus aria-hidden="true" /></button><button type="button" aria-label="重置画布演示" onClick={reset}><RotateCcw aria-hidden="true" /></button></div>
        </div>
        <p className="mc-demo-hint" id={hint}>拖动节点或空白处探索 · 聚焦节点后可用方向键移动、Home 复位 · Ctrl / ⌘ + 滚轮缩放</p>
    </div>;
}
