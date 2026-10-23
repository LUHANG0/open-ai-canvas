import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/", width: 1280, height: 900 });
const originals = new Map<string, PropertyDescriptor | undefined>();
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent, localStorage: dom.localStorage, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame: (id: number) => frames.delete(id) })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const localforage = (await import("localforage")).default;
const storage = new Map<string, unknown>();
localforage.getItem = (async (key: string) => storage.get(key) ?? null) as typeof localforage.getItem;
localforage.setItem = (async (key: string, value: unknown) => { storage.set(key, value); return value; }) as typeof localforage.setItem;
localforage.removeItem = (async (key: string) => { storage.delete(key); }) as typeof localforage.removeItem;
const { act, useRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useCanvasNodeControls } = await import("@/pages/canvas/use-canvas-node-controls");
const { useCanvasSelectionController } = await import("@/pages/canvas/use-canvas-selection-controller");
const { useCanvasRenderModel } = await import("@/pages/canvas/use-canvas-render-model");
const { CanvasNode } = await import("@/components/canvas/canvas-node");
const { CanvasNodeType } = await import("@/types/canvas");
type CanvasNodeData = import("@/types/canvas").CanvasNodeData;
const noop = () => {};
const sample = (id = "a", height = 200): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: "fixture", position: { x: 100, y: 100 }, width: 300, height, metadata: {} });

afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(locked = false) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    let api: any;
    function Harness() {
        const [nodes, setNodes] = useState([{ ...sample(), metadata: { locked } }, sample("b")]);
        const nodesRef = useRef(nodes); nodesRef.current = nodes;
        const [selected, setSelected] = useState(new Set<string>());
        const selectedNodeIdsRef = useRef(selected); selectedNodeIdsRef.current = selected;
        const [hovered, setHovered] = useState<string | null>(null);
        const controls = useCanvasNodeControls();
        const containerRef = useRef<HTMLDivElement>(null);
        const viewportRef = useRef({ x: 0, y: 0, k: 1 });
        const historyPausedRef = useRef(false);
        const controller = useCanvasSelectionController({ containerRef, nodesRef, viewportRef, selectedNodeIdsRef, historyPausedRef, screenToCanvas: (x, y) => ({ x, y }), setNodes, setSelectedNodeIds: setSelected, setSelectedConnectionId: noop, cancelPendingConnectionCreate: noop, onCanvasSelectionStart: noop, onNodeInteractionStart: (modifier) => { controls.setToolbarNodeId(null); if (modifier) controls.setDialogNodeId(null); }, onNodeClick: (node) => { controls.setToolbarNodeId(node.id); controls.setDialogNodeId(node.id); }, onNodeDragEnd: controls.closeNodeControls, onDeselect: controls.closeNodeControls });
        const model = useCanvasRenderModel({ nodes, connections: [], assets: [], viewport: viewportRef.current, viewportSize: { width: 1280, height: 900 }, selectedNodeIds: selected, toolbarNodeId: controls.toolbarNodeId, hoveredNodeId: hovered, dragPreview: controller.dragPreview, collapsingBatchIds: new Set(), addedSkills: [], infoNodeId: null, cropNodeId: null, maskEditNodeId: null, imageEditNodeId: null, annotationNodeId: null, splitNodeId: null, upscaleNodeId: null, superResolveNodeId: null, angleNodeId: null, lightingNodeId: null, emotionNodeId: null, previewNodeId: null, contextMenu: null, previsNodeId: null, scriptEditorNodeId: null, dialogNodeId: controls.dialogNodeId });
        api = { nodes, selected, controls, controller, historyPausedRef, model, create: () => { const node = sample("new"); setNodes((current) => [...current, node]); setSelected(new Set([node.id])); controls.setDialogNodeId(node.id); } };
        return <div ref={containerRef} onPointerDown={controller.handleCanvasMouseDown}>
            {nodes.map((node) => <div key={node.id} data-test-node={node.id} onMouseDown={(event) => controller.handleNodeMouseDown(event, node.id)} onMouseEnter={() => setHovered(node.id)} />)}
            <output data-upper>{!controller.isNodeDragging ? model.toolbarNode?.id : ""}</output>
            <output data-lower>{!controller.isNodeDragging ? controls.dialogNodeId : ""}</output>
        </div>;
    }
    await act(async () => root.render(<Harness />));
    const mouse = async (type: string, id = "a", x = 110, y = 110, modifiers = {}) => act(async () => {
        const event = new dom.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, ...modifiers });
        (type === "mousedown" || type === "mouseover" ? host.querySelector(`[data-test-node="${id}"]`)! : window).dispatchEvent(event as unknown as Event);
    });
    const shown = () => [host.querySelector("[data-upper]")!.textContent, host.querySelector("[data-lower]")!.textContent];
    const cleanup = async () => { await act(async () => root.unmount()); host.remove(); frames.clear(); };
    return { host, api: () => api, mouse, shown, cleanup };
}

test("explicit click activates both areas; drag keeps selection but needs another click, including the same node", async () => {
    const f = await fixture();
    try {
        await f.mouse("mousedown"); await f.mouse("mouseup");
        expect(f.shown()).toEqual(["a", "a"]);
        await f.mouse("mousedown"); await f.mouse("mousemove", "a", 150, 130);
        expect(f.shown()).toEqual(["", ""]);
        await f.mouse("mouseup", "a", 150, 130);
        expect(f.shown()).toEqual(["", ""]);
        expect([...f.api().selected]).toEqual(["a"]);
        expect(f.api().historyPausedRef.current).toBe(false);
        await f.mouse("mouseover");
        expect(f.shown()).toEqual(["", ""]);
        await f.mouse("mousedown"); await f.mouse("mouseup");
        expect(f.shown()).toEqual(["a", "a"]);
        await f.mouse("mousedown", "b"); await f.mouse("mouseup");
        expect(f.shown()).toEqual(["b", "b"]);
        await act(async () => f.api().controller.deselectCanvas());
        expect(f.shown()).toEqual(["", ""]);
        await act(async () => f.api().create());
        expect(f.shown()).toEqual(["new", "new"]);
    } finally { await f.cleanup(); }
});

test("micro movement is a click; modifier selection and cancel or blur do not activate editors", async () => {
    const f = await fixture();
    try {
        await f.mouse("mousedown"); await f.mouse("mousemove", "a", 112, 112); await f.mouse("mouseup", "a", 112, 112);
        expect(f.shown()).toEqual(["a", "a"]);
        await f.mouse("mousedown", "b", 110, 110, { shiftKey: true }); await f.mouse("mouseup");
        expect(f.api().selected.size).toBe(2);
        expect(f.shown()).toEqual(["", ""]);
        await act(async () => f.api().controller.deselectCanvas());
        for (const type of ["pointercancel", "blur"]) {
            await f.mouse("mousedown");
            await act(async () => window.dispatchEvent(new dom.Event(type) as unknown as Event));
            expect(f.shown()).toEqual(["", ""]);
            expect(f.api().historyPausedRef.current).toBe(false);
        }
    } finally { await f.cleanup(); }
});

test("locked nodes retain click activation without starting a drag", async () => {
    const f = await fixture(true);
    try {
        await f.mouse("mousedown");
        expect(f.shown()).toEqual(["a", "a"]);
        expect(f.api().controller.isNodeDragging).toBe(false);
    } finally { await f.cleanup(); }
});

test("cancelled drags remain selected with controls closed and keyboard editor activation still opens both", async () => {
    const f = await fixture();
    try {
        await f.mouse("mousedown"); await f.mouse("mouseup");
        await f.mouse("mousedown"); await f.mouse("mousemove", "a", 155, 140);
        await act(async () => window.dispatchEvent(new dom.Event("pointercancel") as unknown as Event));
        expect(f.shown()).toEqual(["", ""]);
        expect([...f.api().selected]).toEqual(["a"]);
        await act(async () => f.api().controls.setDialogNodeId("a"));
        expect(f.shown()).toEqual(["a", "a"]);
    } finally { await f.cleanup(); }
});

test("real ordinary and tall node shells keep valid target outlines without tilt attributes or frames", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
        for (const height of [200, 1200]) {
            for (const scale of [0.32, 0.5, 1]) {
            for (const target of [true, false]) {
                await act(async () => root.render(<CanvasNode data={sample("flat", height)} scale={scale} isSelected={false} isRelated={false} isFocusRelated={false} isConnectionTarget={target} connectionApproach={{ x: 390, y: 110 }} onMouseDown={noop} onHoverStart={noop} onHoverEnd={noop} onConnectStart={noop} onResize={noop} onTitleChange={noop} onContentChange={noop} onContextMenu={noop} />));
                const shell = host.querySelector<HTMLElement>(".canvas-node-shell")!;
                expect(shell.hasAttribute("data-connection-tilt")).toBe(false);
                expect(shell.style.getPropertyValue("--connection-tilt-x")).toBe("");
                expect(Boolean(shell.style.outline)).toBe(target);
                // HappyDOM rejects calc() with this CSS variable; the real browser verifies the live outline width.
                expect(shell.style.transform).toBe("");
                expect(host.querySelector<HTMLElement>("[data-node-id]")!.style.height).toBe(`${height}px`);
            }
            }
        }
        expect(frames.size).toBe(0);
    } finally { await act(async () => root.unmount()); host.remove(); }
});
