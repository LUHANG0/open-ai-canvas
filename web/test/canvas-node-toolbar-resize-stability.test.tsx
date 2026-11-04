import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { ComponentProps } from "react";
import type { CanvasNodeData } from "@/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
const observers = new Set<GeometryObserver>();
class GeometryObserver {
    targets = new Set<Element>();
    constructor(public callback: ResizeObserverCallback) { observers.add(this); }
    observe(target: Element) { this.targets.add(target); }
    unobserve(target: Element) { this.targets.delete(target); }
    disconnect() { observers.delete(this); this.targets.clear(); }
}
for (const key of ["window", "document", "navigator", "Element", "Node", "HTMLElement", "SVGElement", "CSS", "localStorage", "CustomEvent", "Event", "Document", "ShadowRoot", "MutationObserver"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? dom : Reflect.get(dom, key) });
}
for (const [key, value] of Object.entries({ ResizeObserver: GeometryObserver, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// Import after installing the DOM so React DOM and AntD take their client paths.
const { act, Profiler } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("antd");
const { CanvasNodeToolbar } = await import("@/components/canvas/canvas-node-toolbar");
const { CanvasNodeType } = await import("@/types/canvas");
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

const noop = () => {};
const actions = Object.fromEntries(["Info", "EditText", "DecreaseFont", "IncreaseFont", "ToggleDialog", "Annotate", "AnnotationEdit", "TextEdit", "GenerateImage", "Upload", "Download", "SaveAsset", "MaskEdit", "RemoveBackground", "LayerDecomposition", "Emotion", "PortraitTexture", "Crop", "Split", "Upscale", "SuperResolve", "Angle", "Lighting", "Panorama", "Previs", "ViewMedia", "ExtractVideoFrames", "ExtractAudioFromVideo", "TrimVideoSegments", "Subtitles", "Timeline", "ReversePrompt", "Retry", "ToggleFreeResize", "ToggleLocked", "Delete", "NineGrid"].map(name => [`on${name}`, noop])) as Omit<ComponentProps<typeof CanvasNodeToolbar>, "node" | "viewport" | "containerRef">;

test("selected-node geometry updates retain real inset width without nested geometry commits", async () => {
    const host = document.createElement("main");
    const container = document.createElement("div");
    const sidebar = document.createElement("aside");
    sidebar.className = "canvas-project-sidebar";
    host.append(sidebar, container); document.body.append(host);
    let sidebarWidth = 78;
    container.getBoundingClientRect = () => new dom.DOMRect(0, 0, 1920, 817) as DOMRect;
    sidebar.getBoundingClientRect = () => new dom.DOMRect(0, 0, sidebarWidth, 817) as DOMRect;
    // HappyDOM has no layout engine. Supply stable real-route toolbar dimensions,
    // not mocked component hooks, state setters, or overlay subscription callbacks.
    Object.defineProperties(dom.HTMLElement.prototype, {
        offsetWidth: { configurable: true, get() { return this.classList.contains("canvas-node-toolbar") ? 918 : 0; } },
        offsetHeight: { configurable: true, get() { return this.classList.contains("canvas-node-toolbar") ? 44 : 0; } },
        scrollWidth: { configurable: true, get() { return this.getAttribute("role") === "toolbar" ? 918 : 0; } },
    });
    const containerRef = { current: container };
    let node: CanvasNodeData = { id: "image", type: CanvasNodeType.Image, title: "Image", position: { x: 0, y: 140 }, width: 520, height: 390, metadata: { content: "fixture.png" } };
    const commits: Array<{ phase: string; width: string | undefined }> = [];
    const root = createRoot(container);
    const render = () => root.render(<App><Profiler id="toolbar" onRender={(_id, phase) => { commits.push({ phase, width: container.querySelector<HTMLElement>(".canvas-node-toolbar")?.style.maxWidth }); }}>
        <div data-node-id={node.id} />
        <CanvasNodeToolbar {...actions} node={node} containerRef={containerRef} viewport={{ x: 0, y: 0, k: 1 }} />
    </Profiler></App>);
    const toolbar = () => container.querySelector<HTMLElement>(".canvas-node-toolbar")!;
    const notifyBounds = () => {
        for (const observer of [...observers]) observer.callback([], observer as unknown as ResizeObserver);
    };
    try {
        await act(async () => render());
        expect(toolbar().style.maxWidth).toBe("1818px");
        expect(toolbar().style.transform).toBe("translate3d(549px, 110px, 0)");
        expect(commits.filter(commit => commit.width).every(commit => commit.width === "1818px")).toBe(true);
        commits.length = 0;
        for (let step = 1; step <= 8; step++) {
            node = { ...node, width: 520 + step * 10 };
            await act(async () => render());
        }
        // Each parent node update needs one commit, not an additional synchronous
        // toolbar commit caused by replacing the inset width with full width and back.
        expect(commits).toEqual(Array.from({ length: 8 }, () => ({ phase: "update", width: "1818px" })));
        sidebarWidth = 340;
        await act(async () => notifyBounds());
        expect(toolbar().style.maxWidth).toBe("1556px");
        expect(toolbar().style.transform).toBe("translate3d(811px, 110px, 0)");
        sidebarWidth = 0;
        await act(async () => notifyBounds());
        expect(toolbar().style.maxWidth).toBe("1896px");
        expect(toolbar().style.transform).toBe("translate3d(471px, 110px, 0)");
        await act(async () => {
            sidebarWidth = 340; notifyBounds();
            sidebarWidth = 0; notifyBounds();
        });
        expect(toolbar().style.maxWidth).toBe("1896px");
    } finally {
        await act(async () => root.unmount()); host.remove();
    }
});
