import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage, Event: dom.Event, CustomEvent: dom.CustomEvent, HTMLElement: dom.HTMLElement, HTMLBodyElement: dom.HTMLBodyElement, HTMLHtmlElement: dom.HTMLHtmlElement, SVGElement: dom.SVGElement, Element: dom.Element, ResizeObserver: dom.ResizeObserver, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
afterAll(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("antd");
const { CanvasMediaVersionModal } = await import("@/components/canvas/canvas-media-version-modal");
const { useCanvasNodeOperations } = await import("@/pages/canvas/use-canvas-node-operations");
const { canvasEditLeases } = await import("@/services/canvas-edit-leases");
const { ensureCurrentMediaVersion, recordReplacedMediaVersion, listMediaVersions } = await import("@/lib/canvas/canvas-media-versions");
const { CanvasNodeType } = await import("@/types/canvas");
import type { CanvasNodeData } from "@/types/canvas";
function fixture() {
    const base: CanvasNodeData = { id: "image", title: "版本验收", type: CanvasNodeType.Image, width: 320, height: 240, position: { x: 0, y: 0 }, metadata: { content: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", status: "success", producedModel: "旧模型", prompt: "旧提示词" } };
    const old = ensureCurrentMediaVersion(base);
    return recordReplacedMediaVersion(old, { ...base, metadata: { ...base.metadata, content: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='2'/>", producedModel: "新模型", prompt: "新提示词" } }, "generate");
}
async function mount(render: Parameters<ReturnType<typeof createRoot>["render"]>[0]) {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(render));
    return { cleanup: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test("version panel isolates keyboard events, previews deliberately and adopts only the selected version", async () => {
    const node = fixture(), versions = listMediaVersions(node); let bubbled = 0, closed = 0; const adopted: string[] = [];
    const view = await mount(<div onKeyDown={() => bubbled++}><CanvasMediaVersionModal node={node} onClose={() => closed++} onAdopt={(_, id) => { adopted.push(id); return true; }} onDelete={() => true} onExtract={() => {}} /></div>);
    try {
        const panel = document.querySelector<HTMLElement>("[data-canvas-no-zoom][data-canvas-wheel-scroll]")!;
        expect(panel).not.toBeNull();
        await act(async () => panel.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })));
        expect(adopted).toHaveLength(0);
        expect(document.querySelector('[aria-selected="true"]')?.getAttribute('data-version-id')).toBe(versions[0].id);
        await act(async () => panel.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
        expect(bubbled).toBe(0); expect(adopted).toHaveLength(0);
        await act(async () => panel.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
        expect(adopted).toEqual([versions[0].id]); expect(closed).toBe(1);
    } finally { await view.cleanup(); }
});
test("locked panel previews old version while blocking adoption and deletion", async () => {
    const node = fixture(); node.metadata!.locked = true; let adopted = 0;
    const view = await mount(<CanvasMediaVersionModal node={node} onClose={() => {}} onAdopt={() => { adopted++; return true; }} onDelete={() => true} onExtract={() => {}} />);
    try {
        const panel = document.querySelector<HTMLElement>("[data-canvas-no-zoom]")!;
        await act(async () => panel.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
        const button = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('切换到 V1'))!;
        expect(button.disabled).toBe(true);
        await act(async () => panel.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
        expect(adopted).toBe(0);
    } finally { await view.cleanup(); }
});
test("node commands read latest refs, respect edit leases, and commit/select extracted nodes", async () => {
    const node = fixture(), versions = listMediaVersions(node), nodesRef = { current: [node] };
    let commands: ReturnType<typeof useCanvasNodeOperations>; let committed = 0; let selected = new Set<string>(); let leaseGranted = false;
    const originalInput = canvasEditLeases.input;
    canvasEditLeases.input = () => leaseGranted;
    function Harness() {
        commands = useCanvasNodeOperations({ projectId: "fixture", defaultDrawingEngine: "excalidraw", nodesRef, connectionsRef: { current: [] }, selectedNodeIdsRef: { current: new Set() }, getCanvasCenter: () => ({ x: 0, y: 0 }), setNodes: () => { committed++; }, setConnections: () => {}, setSelectedNodeIds: (next) => { if (typeof next !== "function") selected = next; }, setSelectedConnectionId: () => {}, setContextMenu: () => {}, setDialogNodeId: () => {}, setToolbarNodeId: () => {}, onNodesDeleted: () => {} }); return null;
    }
    const view = await mount(<App><Harness /></App>);
    try {
        await act(async () => expect(commands!.adoptNodeMediaVersion(node.id, versions[0].id)).toBe(false)); expect(committed).toBe(0);
        leaseGranted = true;
        nodesRef.current = [{ ...node, metadata: { ...node.metadata, locked: true } }];
        await act(async () => expect(commands!.adoptNodeMediaVersion(node.id, versions[0].id)).toBe(false)); expect(committed).toBe(0);
        nodesRef.current = [node];
        await act(async () => expect(commands!.adoptNodeMediaVersion(node.id, versions[0].id)).toBe(true)); expect(committed).toBe(1);
        expect(nodesRef.current[0].metadata?.currentMediaVersionId).toBe(versions[0].id);
        await act(async () => expect(commands!.deleteNodeMediaVersion(node.id, versions[0].id)).toBe(false)); expect(committed).toBe(1);
        let id: string | null = null;
        await act(async () => { id = commands!.extractNodeMediaVersion(node.id, versions[1].id); });
        expect(nodesRef.current).toHaveLength(2); expect(selected.has(id!)).toBe(true);
        expect(nodesRef.current[1].metadata?.mediaVersions).toBeUndefined();
    } finally { canvasEditLeases.input = originalInput; await view.cleanup(); }
});

test("removing history opens confirmation and invokes deletion only after confirming", async () => {
    const node = fixture(); let deleted = 0;
    const view = await mount(<CanvasMediaVersionModal node={node} onClose={() => {}} onAdopt={() => true} onDelete={() => { deleted++; return true; }} onExtract={() => {}} />);
    try {
        const panel = document.querySelector<HTMLElement>("[data-canvas-no-zoom]")!;
        await act(async () => panel.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
        const remove = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('删除此版本'))!;
        await act(async () => remove.click());
        expect(deleted).toBe(0);
        expect(document.body.textContent).toContain("删除 V1？");
        const confirm = [...document.querySelectorAll('.ant-popconfirm button')].find(button => button.textContent?.replace(/\s/g,'') === '删除') as HTMLButtonElement;
        expect(confirm).toBeDefined();
        expect(panel.contains(confirm)).toBe(true);
        await act(async () => confirm.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
        expect(document.querySelector('[aria-selected="true"]')?.getAttribute('data-version-id')).toBe(listMediaVersions(node)[0].id);
        await act(async () => confirm.click()); expect(deleted).toBe(1);
    } finally { await view.cleanup(); }
});
