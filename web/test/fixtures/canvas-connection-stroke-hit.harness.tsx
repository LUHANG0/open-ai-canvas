import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { CanvasConnectionHitLayer } from "@/components/canvas/canvas-connections";
import { canvasConnectionPath } from "@/lib/canvas/canvas-connection-geometry";
import { getCanvasConnectionStrokeHitTester } from "@/lib/canvas/canvas-connection-stroke-hit";
import { batchCellHandle } from "@/lib/canvas/canvas-batch-references";
import { CanvasNodeType, type CanvasDisplayConnection, type CanvasNodeData } from "@/types/canvas";

declare global {
    interface Window {
        result?: { fallback: boolean; checks: string[] };
        failure?: string;
        nativeStrokeResult?: (payload: string) => void;
    }
}

async function run() {
    const checks: string[] = [];
    const assert = (condition: unknown, message: string) => {
        if (!condition) throw Error(message);
        checks.push(message);
    };
    const tick = () => {
        const { promise, resolve } = Promise.withResolvers<void>();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        return promise;
    };
    const fallback = new URL(location.href).searchParams.has("fallback");
    if (fallback) Object.defineProperty(window, "Path2D", { configurable: true, value: undefined });
    const node = (id: string, x: number, y: number): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: id, position: { x, y }, width: 100, height: 100 });
    const a = node("a", 0, 0),
        b = node("b", 500, 0);
    const connection = { id: "lower", fromNodeId: a.id, toNodeId: b.id };
    const geometry = canvasConnectionPath(connection, a, b);
    const tester = getCanvasConnectionStrokeHitTester();
    if (!fallback) {
        assert(tester, "native stroke tester is available");
        const entries = [
            { id: "lower", geometry },
            { id: "upper", geometry },
        ];
        for (const scale of [0.05, 0.5, 1, 2]) {
            assert(tester!.pick(entries, 300, 50 + 7.9 / scale, scale) === "upper", `native +7.9px at ${scale}`);
            assert(tester!.pick(entries, 300, 50 - 7.9 / scale, scale) === "upper", `native -7.9px at ${scale}`);
            assert(tester!.pick(entries, 300, 50 + 8.1 / scale, scale) === null, `native outside +8.1px at ${scale}`);
        }
        assert(tester!.pick(entries, 99.9, 50, 1) === null, "butt caps do not extend before the endpoint");
        assert(tester!.pick(entries, 300, 50, 0) === null, "singular scale cannot select a curve");
        const reverse = canvasConnectionPath({ ...connection, id: "reverse" }, node("right", 1000, 0), node("left", 0, 400));
        const t = 0.1,
            u = 1 - t;
        const point = {
            x: u ** 3 * reverse.startX + 3 * u * u * t * reverse.control1.x + 3 * u * t * t * reverse.control2.x + t ** 3 * reverse.endX,
            y: u ** 3 * reverse.startY + 3 * u * u * t * reverse.control1.y + 3 * u * t * t * reverse.control2.y + t ** 3 * reverse.endY,
        };
        assert(point.x > reverse.startX && tester!.pick([{ id: "reverse", geometry: reverse }], point.x, point.y, 2) === "reverse", "reverse overshoot is hittable beyond the endpoint box");
        assert(tester!.pick([{ id: "reverse", geometry: reverse }], 0, 50, 1) === null, "curve AABB is not an exact hit");
        const resized = canvasConnectionPath(connection, { ...a, width: 140 }, b);
        assert(tester!.pick([{ id: "new", geometry: resized }], 110, 50, 1) === null, "new geometry does not reuse the old native path");
        const table: CanvasNodeData = {
            ...b,
            type: CanvasNodeType.BatchTable,
            width: 1280,
            height: 560,
            metadata: { batchTable: { operation: "creative", referenceColumns: [{ id: "col", label: "C" }], rows: [{ id: "row", prompt: "", inputNodeIds: [] }] } },
        };
        const edge = { ...connection, toHandleId: batchCellHandle("row", "col") };
        const first = canvasConnectionPath(edge, a, table);
        const scrolled = canvasConnectionPath(edge, a, table, 0, 0, undefined, { top: 90, left: 80 });
        assert(first !== scrolled && tester!.pick([{ id: "scroll", geometry: scrolled }], scrolled.endX - 1, scrolled.endY, 1) === "scroll", "scrolled batch port uses its new native geometry");
    } else assert(tester === null, "missing Path2D selects the individual SVG fallback");

    const host = document.createElement("div");
    host.dataset.canvasViewport = "";
    Object.assign(host.style, { position: "relative", width: "900px", height: "600px" });
    document.body.append(host);
    const world = document.createElement("div");
    Object.assign(world.style, { position: "absolute", transformOrigin: "0 0", transform: "translate(60px,80px) scale(.5)" });
    host.append(world);
    const root = createRoot(world);
    let selected: string | null = null,
        menu: string | null = null,
        bubbled = 0,
        scale = 0.5;
    host.addEventListener("click", () => bubbled++);
    let connections: CanvasDisplayConnection[] = [
        { connection, from: a, to: b },
        ...Array.from({ length: 64 }, (_, index) => ({ connection: { ...connection, id: `away-${index}` }, from: node(`a-${index}`, 0, 1200 + index * 100), to: node(`b-${index}`, 500, 1200 + index * 100) })),
        { connection: { ...connection, id: "upper" }, from: a, to: b },
    ];
    const render = () =>
        flushSync(() =>
            root.render(
                <CanvasConnectionHitLayer
                    connections={connections}
                    bounds={{ left: 0, top: 0, width: 2000, height: 9000 }}
                    scale={scale}
                    selectedId={null}
                    relatedIds={new Set()}
                    scriptScrollTopById={{}}
                    hideVisual={false}
                    onSelect={(id) => {
                        selected = id;
                    }}
                    onContextMenu={(_event, id) => {
                        menu = id;
                    }}
                />,
            ),
        );
    render();
    const screen = () => {
        const m = world.querySelector("svg")!.getScreenCTM()!;
        return { x: m.a * 300 + m.e, y: m.d * 50 + m.f };
    };
    const target = (offset: number) => {
        const p = screen();
        return { p, element: document.elementFromPoint(p.x, p.y + offset)! };
    };
    const click = (offset: number) => {
        const { p, element } = target(offset);
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: p.x, clientY: p.y + offset }));
    };
    click(7.9);
    assert(selected === "upper" && bubbled === 0, "last original edge wins across batches and click stops propagation");
    selected = null;
    click(8.1);
    assert(selected === null, "native SVG first layer excludes +8.1 screen pixels");
    const { p, element } = target(0);
    const context = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y });
    element.dispatchEvent(context);
    assert(menu === "upper" && context.defaultPrevented, "context menu identifies the top edge and prevents the browser menu");
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: p.x, clientY: p.y }));
    await tick();
    const hover = () => !!world.querySelector('[data-connection-visual="upper"] [data-connection-beam]');
    if (!fallback) assert(hover(), "hover mounts the selected edge beam without a second hit surface");
    world.style.transform = "translate(60px,140px) scale(.5)";
    host.dispatchEvent(new CustomEvent("canvas:graphics-viewport-preview", { detail: { x: 60, y: 140, k: 0.5 } }));
    await tick();
    if (!fallback) assert(!hover(), "stationary pointer loses hover when pan moves the curve away");
    world.style.transform = "translate(60px,80px) scale(.5)";
    host.dispatchEvent(new CustomEvent("canvas:graphics-viewport-preview", { detail: { x: 60, y: 80, k: 0.5 } }));
    await tick();
    if (!fallback) assert(hover(), "stationary pointer reacquires hover when the curve returns");
    host.dataset.canvasViewportInteracting = "true";
    world.style.transform = "translate(60px,80px) scale(1.2)";
    host.dispatchEvent(new CustomEvent("canvas:graphics-viewport-preview", { detail: { x: 60, y: 80, k: 1.2 } }));
    await tick();
    selected = null;
    click(-7.9);
    assert(selected === "upper", "live CSS zoom preserves -7.9 screen pixel hits before commit");
    selected = null;
    click(-8.1);
    assert(selected === null, "live CSS zoom excludes -8.1 screen pixels before commit");
    scale = 1.2;
    delete host.dataset.canvasViewportInteracting;
    render();
    selected = null;
    click(7.9);
    assert(selected === "upper", "committed zoom preserves sixteen-pixel hit width");
    const exit = target(0);
    exit.element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: exit.p.x, clientY: exit.p.y }));
    await tick();
    exit.element.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: null }));
    await tick();
    if (!fallback) assert(!hover(), "leaving the document clears hover without another pointer move");
    host.dispatchEvent(new CustomEvent("canvas:node-drag-preview", { detail: { x: 0, y: 120, nodeIds: new Set([a.id, b.id]) } }));
    await tick();
    selected = null;
    click(0);
    assert(selected === null, "live drag removes the old hit location");
    const dragMatrix = world.querySelector("svg")!.getScreenCTM()!;
    const dragX = dragMatrix.a * 300 + dragMatrix.e,
        dragY = dragMatrix.d * 170 + dragMatrix.f;
    document.elementFromPoint(dragX, dragY)!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: dragX, clientY: dragY }));
    assert(selected === "upper", "live drag hit geometry follows both translated endpoints");
    host.dispatchEvent(new CustomEvent("canvas:node-drag-preview", { detail: null }));
    await tick();
    selected = null;
    click(0);
    assert(selected === "upper", "drag release removes the preview translation exactly once");
    connections = connections.map((item) => (item.connection.id === "lower" || item.connection.id === "upper" ? { ...item, from: { ...a, width: 200 } } : item));
    render();
    const resizeMatrix = world.querySelector("svg")!.getScreenCTM()!;
    const resizeX = resizeMatrix.a * 150 + resizeMatrix.e,
        resizeY = resizeMatrix.d * 50 + resizeMatrix.f;
    selected = null;
    document.elementFromPoint(resizeX, resizeY)!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: resizeX, clientY: resizeY }));
    assert(selected === null, "resized source anchor no longer hits the old leading segment");
    root.unmount();
    host.remove();
    return { fallback, checks };
}
run()
    .then((result) => {
        window.result = result;
        window.nativeStrokeResult?.(JSON.stringify({ result }));
    })
    .catch((error) => {
        window.failure = String(error.stack || error);
        window.nativeStrokeResult?.(JSON.stringify({ failure: window.failure }));
    });
