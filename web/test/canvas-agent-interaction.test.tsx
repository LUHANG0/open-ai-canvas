import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { ReactNode } from "react";

const dom = new Window({ url: "http://localhost/" });
Object.defineProperty(dom.Element.prototype, "animate", { configurable: true, value: undefined });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, MutationObserver: dom.MutationObserver, localStorage: dom.localStorage, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
// Exercise browser initialization after installing the DOM; static imports select SSR behavior.
const { createRoot } = await import("react-dom/client");
const { AnimatePresence, motion } = await import("motion/react");
const { useAgentCanvasInteraction } = await import("@/components/canvas/use-agent-canvas-interaction");

afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

function Panel({ context, open = true }: { context: object | null; open?: boolean }) {
    const ref = useAgentCanvasInteraction(context);
    return open ? <motion.aside ref={ref} className="canvas-agent-panel" /> : null;
}

async function fixture() {
    const main = document.createElement("main");
    main.id = "canvas-main";
    const viewport = document.createElement("div");
    viewport.setAttribute("data-canvas-viewport", "");
    main.append(viewport);
    const host = document.createElement("div");
    document.body.append(main, host);
    const root = createRoot(host);
    const render = async (element: ReactNode) => { await act(async () => { root.render(element); }); };
    const flush = async () => { await act(async () => { await Bun.sleep(5); }); };
    return { main, viewport, host, render, flush, cleanup: async () => { await act(async () => { root.unmount(); }); main.remove(); host.remove(); } };
}

test("interaction OR survives overlap, clears at idle, and ignores identical values", async () => {
    const f = await fixture();
    const context = { canvasId: "a" };
    try {
        f.viewport.dataset.canvasViewportInteracting = "true";
        await f.render(<Panel context={context} />);
        const panel = f.host.querySelector<HTMLElement>("aside")!;
        expect(panel.dataset.canvasInteracting).toBe("true");
        const changes: MutationRecord[] = [];
        const observer = new MutationObserver((records) => changes.push(...records));
        observer.observe(panel, { attributes: true, attributeFilter: ["data-canvas-interacting"] });
        f.viewport.dataset.canvasNodeDragging = "true";
        delete f.viewport.dataset.canvasViewportInteracting;
        await f.flush();
        expect(panel.dataset.canvasInteracting).toBe("true");
        await f.render(<Panel context={{ ...context }} />);
        await f.flush();
        expect(changes).toHaveLength(0);
        delete f.viewport.dataset.canvasNodeDragging;
        await f.flush();
        expect(panel.hasAttribute("data-canvas-interacting")).toBe(false);
        expect(changes).toHaveLength(1);
        observer.disconnect();
    } finally { await f.cleanup(); }
});

test("an already open Motion panel binds after context publication and rebinds across canvases", async () => {
    const f = await fixture();
    try {
        await f.render(<Panel context={null} />);
        const panel = f.host.querySelector<HTMLElement>("aside")!;
        f.viewport.dataset.canvasNodeDragging = "true";
        await f.render(<Panel context={{ canvasId: "a" }} />);
        expect(panel.dataset.canvasInteracting).toBe("true");
        const nextViewport = document.createElement("div");
        nextViewport.setAttribute("data-canvas-viewport", "");
        f.viewport.replaceWith(nextViewport);
        await f.render(<Panel context={{ canvasId: "b" }} />);
        expect(panel.hasAttribute("data-canvas-interacting")).toBe(false);
        f.viewport.dataset.canvasViewportInteracting = "true";
        await f.flush();
        expect(panel.hasAttribute("data-canvas-interacting")).toBe(false);
        nextViewport.dataset.canvasViewportInteracting = "true";
        await f.flush();
        expect(panel.dataset.canvasInteracting).toBe("true");
        await f.render(<Panel context={null} />);
        expect(panel.hasAttribute("data-canvas-interacting")).toBe(false);
        nextViewport.dataset.canvasNodeDragging = "true";
        await f.flush();
        expect(panel.hasAttribute("data-canvas-interacting")).toBe(false);
    } finally { await f.cleanup(); }
});

test("opening during a gesture synchronizes immediately and unmount disconnects the observer", async () => {
    const f = await fixture();
    const context = { canvasId: "a" };
    try {
        await f.render(<Panel context={context} open={false} />);
        f.viewport.dataset.canvasNodeDragging = "true";
        await f.render(<Panel context={context} />);
        const panel = f.host.querySelector<HTMLElement>("aside")!;
        expect(panel.dataset.canvasInteracting).toBe("true");
        await f.render(<Panel context={context} open={false} />);
        delete f.viewport.dataset.canvasNodeDragging;
        await f.flush();
        // Detached panel must not receive updates from its former viewport.
        expect(panel.dataset.canvasInteracting).toBe("true");
        await f.render(<Panel context={context} />);
        expect(f.host.querySelector("aside")!.hasAttribute("data-canvas-interacting")).toBe(false);
    } finally { await f.cleanup(); }
});

test("animated exit disconnects even when the parent does not commit again", async () => {
    const f = await fixture();
    const context = { canvasId: "a" };
    function AnimatedPanel({ open }: { open: boolean }) {
        const ref = useAgentCanvasInteraction(context);
        return <AnimatePresence>{open ? <motion.aside ref={ref} exit={{ opacity: 0 }} transition={{ duration: 0.01 }} /> : null}</AnimatePresence>;
    }
    try {
        f.viewport.dataset.canvasNodeDragging = "true";
        await f.render(<AnimatedPanel open />);
        const panel = f.host.querySelector<HTMLElement>("aside")!;
        await f.render(<AnimatedPanel open={false} />);
        await act(async () => { await Bun.sleep(100); });
        expect(f.host.querySelector("aside")).toBeNull();
        delete f.viewport.dataset.canvasNodeDragging;
        await f.flush();
        expect(panel.dataset.canvasInteracting).toBe("true");
    } finally { await f.cleanup(); }
});
