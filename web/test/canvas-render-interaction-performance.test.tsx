import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    CustomEvent: dom.CustomEvent,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// React DOM must load after the isolated browser globals are installed.
const { act, createRef, useLayoutEffect } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useCanvasVisibilityViewport } = await import("@/pages/canvas/use-canvas-visibility-viewport");
const { useCanvasRenderModel } = await import("@/pages/canvas/use-canvas-render-model");
const { CanvasNodeType } = await import("@/types/canvas");
const { applyCanvasLiveViewport } = await import("@/lib/canvas/canvas-live-viewport");
import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, d] of originals) {
        if (d) Object.defineProperty(globalThis, key, d);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("visibility follows continuous preview and cannot roll a new commit back", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const ref = createRef<HTMLDivElement>();
    let observed: ViewportTransform = { x: 0, y: 0, k: 1 };
    let viewport = observed;
    const coverage = { current: () => true };
    function Harness() {
        observed = useCanvasVisibilityViewport(viewport, ref, { width: 800, height: 600 }, coverage);
        return <div ref={ref} />;
    }
    try {
        await act(async () => root.render(<Harness />));
        for (let i = 1; i <= 12; i++) {
            await act(async () => {
                applyCanvasLiveViewport(ref.current, { x: -i * 100, y: 0, k: 1 }, false);
            });
            expect(observed.x).toBe(-i * 100);
        }
        // A background node rerender must not restore the committed location.
        await act(async () => root.render(<Harness />));
        expect(observed.x).toBe(-1200);
        viewport = { x: 25, y: 30, k: 0.5 };
        await act(async () => root.render(<Harness />));
        expect(observed).toBe(viewport);
        await act(async () => applyCanvasLiveViewport(ref.current, { x: 25, y: 30, k: 0.4 }, false));
        expect(observed.k).toBe(0.4);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

function node(id: string, x: number): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x, y: 0 }, width: 200, height: 160, metadata: { content: "/image/" + id, storageKey: "resource:" + id } };
}
function options(nodes: CanvasNodeData[]) {
    return {
        nodes,
        connections: [],
        assets: [],
        viewport: { x: 0, y: 0, k: 1 },
        viewportSize: { width: 800, height: 600 },
        selectedNodeIds: new Set<string>(),
        toolbarNodeId: null,
        hoveredNodeId: null,
        dragPreview: null,
        collapsingBatchIds: new Set<string>(),
        addedSkills: [],
        infoNodeId: null,
        cropNodeId: null,
        maskEditNodeId: null,
        imageEditNodeId: null,
        annotationNodeId: null,
        splitNodeId: null,
        upscaleNodeId: null,
        superResolveNodeId: null,
        angleNodeId: null,
        lightingNodeId: null,
        emotionNodeId: null,
        previewNodeId: null,
        contextMenu: null,
        previsNodeId: null,
        scriptEditorNodeId: null,
        dialogNodeId: null,
    };
}

test("unrelated updates retain node resource props while changed content invalidates", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let props = options([node("a", 0), node("b", 300)]);
    let model!: { resourceReferenceByNodeId: Map<string, CanvasResourceReference>; mentionReferencesByNodeId: Map<string, CanvasResourceReference[]> };
    function Harness() {
        model = useCanvasRenderModel(props);
        return null;
    }
    try {
        await act(async () => root.render(<Harness />));
        const a = model.resourceReferenceByNodeId.get("a");
        const mentions = model.mentionReferencesByNodeId.get("a");
        props = { ...props, nodes: [props.nodes[0], { ...props.nodes[1], title: "changed" }] };
        await act(async () => root.render(<Harness />));
        expect(model.resourceReferenceByNodeId.get("a")).toBe(a);
        expect(model.mentionReferencesByNodeId.get("a")).toBe(mentions);
        props = { ...props, nodes: [{ ...props.nodes[0], metadata: { ...props.nodes[0].metadata, content: "/new", storageKey: "resource:new" } }, props.nodes[1]] };
        await act(async () => root.render(<Harness />));
        expect(model.resourceReferenceByNodeId.get("a")).not.toBe(a);
        expect(model.resourceReferenceByNodeId.get("a")?.previewUrl).toBe("/new");
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

test("select all keeps offscreen selection without forcing thousands of editors", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const nodes = Array.from({ length: 5000 }, (_, i) => node("n" + i, i * 400));
    const props = { ...options(nodes), selectedNodeIds: new Set(nodes.map((n) => n.id)) };
    let ids: string[] = [];
    let selectedCount = 0;
    function Harness() {
        const model = useCanvasRenderModel(props);
        ids = model.visibleNodes.map((n) => n.id);
        selectedCount = model.selectedNodeBounds?.count || 0;
        return null;
    }
    try {
        await act(async () => root.render(<Harness />));
        expect(ids).toContain("n0");
        expect(ids).toContain("n1");
        expect(ids).not.toContain("n4999");
        expect(selectedCount).toBe(5000);
        expect(props.selectedNodeIds.has("n4999")).toBe(true);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

for (const step of [
    { name: "aggregated pan", x: 3300, next: { x: -3200, y: 0, k: 1 } },
    { name: "aggregated zoom out", x: 1200, next: { x: 0, y: 0, k: 0.5 } },
]) {
    test(`${step.name} mounts newly exposed nodes synchronously without forcing covered motion`, async () => {
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        const ref = createRef<HTMLDivElement>();
        const coverage = createRef<((next: ViewportTransform) => boolean) | null>();
        let renders = 0;
        const base = { x: 0, y: 0, k: 1 };
        const size = { width: 800, height: 600 };
        const props = options([node("near", 0), node("distant", step.x), node("outside", 12000)]);
        function Harness() {
            renders++;
            const visibility = useCanvasVisibilityViewport(base, ref, size, coverage);
            const model = useCanvasRenderModel({ ...props, viewport: visibility, viewportSize: size });
            useLayoutEffect(() => {
                coverage.current = model.isVisibilityViewportCovered;
            }, [model.isVisibilityViewportCovered]);
            return (
                <div ref={ref} data-canvas-viewport-interacting="true">
                    <div data-canvas-world-layer>
                        {model.visibleNodes.map((n) => (
                            <div key={n.id} data-node-id={n.id} />
                        ))}
                    </div>
                </div>
            );
        }
        try {
            await act(async () => root.render(<Harness />));
            expect(host.querySelector('[data-node-id="distant"]')).toBeNull();
            await act(async () => {
                const before = renders;
                applyCanvasLiveViewport(ref.current, { x: -100, y: 0, k: 1 }, false);
                expect(renders).toBe(before);
            });
            await act(async () => {
                applyCanvasLiveViewport(ref.current, step.next, false);
                expect(host.querySelector('[data-node-id="distant"]')).not.toBeNull();
                expect(host.querySelector('[data-node-id="outside"]')).toBeNull();
            });
        } finally {
            await act(async () => root.unmount());
            host.remove();
        }
    });
}
