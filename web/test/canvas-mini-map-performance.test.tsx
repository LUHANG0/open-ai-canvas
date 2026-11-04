import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";
import { canvasThemes } from "@/lib/canvas-theme";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    CustomEvent: dom.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
let activeTheme: "light" | "dark" = "light";
// Only theme persistence and the browser's raster context are replaced.
mock.module("@/stores/canvas/use-canvas-theme-store", () => ({ useActiveTheme: () => activeTheme }));
// ReactDOM and the component must load after DOM globals and the theme module replacement.
// Static imports would evaluate them before this test's browser/module-loading boundary.
const { act, createRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Minimap } = await import("@/components/canvas/canvas-mini-map");
const { CANVAS_VIEWPORT_PREVIEW_EVENT } = await import("@/lib/canvas/canvas-live-viewport");

afterAll(async () => {
    await dom.happyDOM.abort();
    mock.restore();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

const initialNodes: CanvasNodeData[] = [{ id: "text", title: "Text", type: CanvasNodeType.Text, position: { x: 0, y: 0 }, width: 200, height: 100 }];

async function fixture(nodes = initialNodes) {
    activeTheme = "light";
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const canvasContainerRef = createRef<HTMLDivElement>();
    canvasContainerRef.current = document.createElement("div");
    const committed: ViewportTransform[] = [];
    const previews: ViewportTransform[] = [];
    const draws: Array<{ kind: string; color: string; rect: number[] }> = [];
    const context = {
        fillStyle: "",
        strokeStyle: "",
        globalAlpha: 1,
        lineWidth: 0,
        clearRect: (...rect: number[]) => draws.push({ kind: "clear", color: "", rect }),
        fillRect: (...rect: number[]) => draws.push({ kind: "fill", color: context.fillStyle, rect }),
        strokeRect: (...rect: number[]) => draws.push({ kind: "stroke", color: context.strokeStyle, rect }),
    };
    const originalGetContext = Object.getOwnPropertyDescriptor(dom.HTMLCanvasElement.prototype, "getContext");
    Object.defineProperty(dom.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => context });
    let viewport = { x: 0, y: 0, k: 1 };
    let viewportSize = { width: 800, height: 600 };
    const render = async (next: { nodes?: CanvasNodeData[]; viewport?: ViewportTransform; viewportSize?: typeof viewportSize; theme?: "light" | "dark" } = {}) => {
        nodes = next.nodes ?? nodes;
        viewport = next.viewport ?? viewport;
        viewportSize = next.viewportSize ?? viewportSize;
        activeTheme = next.theme ?? activeTheme;
        await act(async () =>
            root.render(<Minimap nodes={nodes} viewport={viewport} viewportSize={viewportSize} canvasContainerRef={canvasContainerRef} onViewportPreviewChange={(value) => previews.push(value)} onViewportChange={(value) => committed.push(value)} />),
        );
    };
    await render();
    const canvas = host.querySelector("canvas")!;
    const surface = canvas.parentElement!;
    const overlay = () => surface.querySelector<HTMLDivElement>("div")!;
    const captures: number[] = [];
    surface.setPointerCapture = (id: number) => {
        captures.push(id);
    };
    const pointer = async (type: string, x: number, y: number) => {
        const event = new dom.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y });
        await act(async () => {
            surface.dispatchEvent(event);
        });
        return event;
    };
    const preview = async (value: ViewportTransform) => {
        await act(async () => {
            canvasContainerRef.current!.dispatchEvent(new dom.CustomEvent(CANVAS_VIEWPORT_PREVIEW_EVENT, { detail: value }));
        });
    };
    const geometry = () => [overlay().style.left, overlay().style.top, overlay().style.width, overlay().style.height].map(parseFloat);
    const cleanup = async () => {
        await act(async () => root.unmount());
        host.remove();
        if (originalGetContext) Object.defineProperty(dom.HTMLCanvasElement.prototype, "getContext", originalGetContext);
        else Reflect.deleteProperty(dom.HTMLCanvasElement.prototype, "getContext");
    };
    return { render, canvas, surface, overlay, draws, captures, pointer, preview, geometry, previews, committed, cleanup, canvasContainerRef };
}

test("viewport previews and commits move one DOM rectangle without repainting nodes", async () => {
    const f = await fixture();
    try {
        expect(f.draws.filter((draw) => draw.kind === "clear")).toHaveLength(1);
        expect(f.draws.filter((draw) => draw.kind === "stroke")).toHaveLength(0);
        expect(f.surface.querySelectorAll("div")).toHaveLength(1);
        const before = f.geometry();
        const drawCount = f.draws.length;
        const live = { x: -300, y: -100, k: 2 };
        for (let index = 0; index < 20; index++) await f.preview({ ...live, x: live.x + index });
        await f.preview(live);
        const after = f.geometry();
        expect(after[0]).not.toBe(before[0]);
        expect(after[2]).toBeCloseTo(before[2] / 2);
        expect(f.draws).toHaveLength(drawCount);
        await f.render({ viewport: live });
        expect(f.geometry()).toEqual(after);
        await f.render({ viewportSize: { width: 400, height: 300 } });
        expect(f.geometry()[2]).toBeCloseTo(after[2] / 2);
        expect(f.draws).toHaveLength(drawCount);
    } finally {
        await f.cleanup();
    }
});

test("node layout and theme changes repaint the base while retaining the latest live viewport", async () => {
    const f = await fixture();
    try {
        const live = { x: -300, y: -150, k: 2 };
        await f.preview(live);
        const liveRect = f.geometry();
        await f.render({ theme: "dark" });
        expect(f.geometry()).toEqual(liveRect);
        expect(f.draws.filter((draw) => draw.kind === "clear")).toHaveLength(2);
        expect(f.draws.filter((draw) => draw.kind === "fill").at(-1)?.color).toBe(canvasThemes.dark.node.muted);
        expect(f.overlay().style.boxShadow).toContain(canvasThemes.dark.node.activeStroke);
        const node = { ...initialNodes[0], position: { x: 1000, y: 500 }, width: 400 };
        await f.render({ nodes: [node] });
        expect(f.draws.filter((draw) => draw.kind === "clear")).toHaveLength(3);
        const scale = Math.min(240 / 1400, 160 / 1100);
        const offsetX = (240 - 1400 * scale) / 2;
        expect(f.geometry()[0]).toBeCloseTo((150 - 500) * scale + offsetX);
        expect(f.geometry()[2]).toBeCloseTo(400 * scale);
        expect(f.draws.filter((draw) => draw.kind === "fill").at(-1)?.rect[2]).toBeCloseTo(400 * scale);
    } finally {
        await f.cleanup();
    }
});

test("collapsed frames keep their outline and hide children from the cached base", async () => {
    const frame: CanvasNodeData = { ...initialNodes[0], id: "frame", type: CanvasNodeType.Frame, metadata: { frame: { collapsed: false, expandedWidth: 200, expandedHeight: 100 } } };
    const child = { ...initialNodes[0], id: "child", parentId: frame.id };
    const f = await fixture([frame, child]);
    try {
        expect(f.draws.filter((draw) => draw.kind === "stroke")).toHaveLength(1);
        await f.render({ nodes: [{ ...frame, metadata: { frame: { collapsed: true, expandedWidth: 200, expandedHeight: 100 } } }, child] });
        const lastClear = f.draws.findLastIndex((draw) => draw.kind === "clear");
        expect(f.draws.slice(lastClear).map((draw) => draw.kind)).toEqual(["clear", "fill", "stroke"]);
    } finally {
        await f.cleanup();
    }
});

for (const finish of ["pointerup", "pointercancel"]) {
    test(`${finish} commits the captured drag's latest preview and stops subsequent movement`, async () => {
        const f = await fixture();
        try {
            const down = await f.pointer("pointerdown", 100, 70);
            expect(down.defaultPrevented).toBe(true);
            expect(f.captures).toEqual([7]);
            const first = f.geometry();
            await f.pointer("pointermove", 140, 90);
            expect(f.geometry()).not.toEqual(first);
            expect(f.previews).toHaveLength(2);
            expect(f.committed).toHaveLength(0);
            const last = f.previews.at(-1)!;
            await f.pointer(finish, 140, 90);
            expect(f.committed).toEqual([last]);
            await f.pointer("pointermove", 160, 100);
            expect(f.previews).toHaveLength(2);
            expect(f.draws.filter((draw) => draw.kind === "clear")).toHaveLength(1);
        } finally {
            await f.cleanup();
        }
    });
}
