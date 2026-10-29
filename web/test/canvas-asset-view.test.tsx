import { afterAll, expect, test, mock } from "bun:test";
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
mock.module("@/components/canvas/canvas-asset-preview", () => ({
    canvasAssetKindIcon: () => null, canvasAssetText: (node: CanvasNodeData) => node.metadata?.content || "",
    CanvasAssetThumbnail: () => null, CanvasAssetPreview: () => <div>媒体预览</div>,
}));
const { CanvasAssetView } = await import("@/components/canvas/canvas-asset-view");
const { useCanvasNodeOperations } = await import("@/pages/canvas/use-canvas-node-operations");
const { canvasEditLeases } = await import("@/services/canvas-edit-leases");
const { buildCanvasAssetCatalog } = await import("@/lib/canvas/canvas-asset-catalog");
const { ensureCurrentMediaVersion, recordReplacedMediaVersion } = await import("@/lib/canvas/canvas-media-versions");
const { CanvasNodeType } = await import("@/types/canvas");
import type { CanvasNodeData } from "@/types/canvas";
function fixture() {
    const base: CanvasNodeData = { id: "image", title: "版本验收", type: CanvasNodeType.Image, width: 320, height: 240, position: { x: 0, y: 0 }, metadata: { content: "/original", storageKey: "resource:old", status: "success", producedModel: "旧模型", prompt: "旧提示词" } };
    const old = ensureCurrentMediaVersion(base);
    const next = recordReplacedMediaVersion(old, { ...old, metadata: { ...old.metadata, content: "/new", storageKey: "resource:new", producedModel: "新模型", prompt: "新提示词" } }, "generate");
    return { ...next, metadata: { ...next.metadata, prompt: "下一次提示词", model: "下一次模型" } };
}
async function mount(render: Parameters<ReturnType<typeof createRoot>["render"]>[0]) {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(render));
    return { cleanup: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const click = async (button: Element) => { await act(async () => (button as HTMLElement).click()); };
const key = async (element: Element, key: string, isComposing = false) => {
    await act(async () => element.dispatchEvent(new dom.KeyboardEvent("keydown", { key, isComposing, bubbles: true, cancelable: true })));
};
const props = { onLocate: () => {}, onRename: () => true, onPromoteVersion: () => {}, onDownloadMedia: () => {}, onUpload: () => {} };

test("asset tree isolates canvas keys and history details use captured model/prompt instead of editable settings", async () => {
    let bubbled = 0;
    const view = await mount(<App><div onKeyDown={() => bubbled++}><CanvasAssetView {...props} nodes={[fixture()]} /></div></App>);
    try {
        const rows = [...document.querySelectorAll('[role="treeitem"]')];
        const entry = rows.find((row) => row.textContent?.includes("版本验收"))!;
        await click(entry);
        const versions = [...document.querySelectorAll('button')].filter((button) => button.textContent === "V1");
        await click(versions[0]);
        const details = document.querySelector('[aria-label="资产信息"]')!;
        expect(details.textContent).toContain("旧模型"); expect(details.textContent).toContain("旧提示词");
        expect(details.textContent).not.toContain("下一次");
        await key(entry, "Delete"); expect(bubbled).toBe(0);
        (entry as HTMLElement).focus(); await key(entry, "ArrowDown");
        expect(document.activeElement?.getAttribute("role")).toBe("treeitem");
    } finally { await view.cleanup(); }
});

test("rename ignores IME confirmation, commits once on Enter, and Escape cancels even on blur", async () => {
    const calls: string[] = [];
    const view = await mount(<App><CanvasAssetView {...props} nodes={[fixture()]} onRename={(_, title) => { calls.push(title); return true; }} /></App>);
    try {
        await click([...document.querySelectorAll('[role="treeitem"]')].find((row) => row.textContent?.includes("版本验收"))!);
        await click(document.querySelector('[aria-label="重命名资产"]')!);
        let input = document.querySelector<HTMLInputElement>('[aria-label="资产名称"]')!;
        await act(async () => { const setter = Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!; setter.call(input, "新名称"); input.dispatchEvent(new dom.Event("input", { bubbles: true })); });
        await key(input, "Enter", true); expect(calls).toHaveLength(0);
        await key(input, "Enter"); expect(calls).toEqual(["新名称"]);
        await click(document.querySelector('[aria-label="重命名资产"]')!);
        input = document.querySelector<HTMLInputElement>('[aria-label="资产名称"]')!;
        await key(input, "Escape"); await act(async () => input.dispatchEvent(new dom.FocusEvent("focusout", { bubbles: true })));
        expect(calls).toHaveLength(1);
    } finally { await view.cleanup(); }
});

test("asset mutations take one commit and reject an entire family if any edit lease is denied", async () => {
    const a = fixture(), b = { ...fixture(), id: "b" };
    a.metadata = { ...a.metadata, versionOfNodeId: a.id, versionLabel: "A", versionPrimary: true };
    b.metadata = { ...b.metadata, versionOfNodeId: a.id, versionLabel: "B" };
    const nodesRef = { current: [a, b] }; let commits = 0, granted = false;
    let commands: ReturnType<typeof useCanvasNodeOperations>;
    const original = canvasEditLeases.input; canvasEditLeases.input = (_, id) => granted || id === a.id;
    function Harness() {
        commands = useCanvasNodeOperations({ projectId: "fixture", defaultDrawingEngine: "excalidraw", nodesRef, connectionsRef: { current: [] }, selectedNodeIdsRef: { current: new Set() }, getCanvasCenter: () => ({ x: 0, y: 0 }), setNodes: () => { commits++; }, setConnections: () => {}, setSelectedNodeIds: () => {}, setSelectedConnectionId: () => {}, setContextMenu: () => {}, setDialogNodeId: () => {}, setToolbarNodeId: () => {}, onNodesDeleted: () => {} }); return null;
    }
    const view = await mount(<App><Harness /></App>);
    try {
        const entry = buildCanvasAssetCatalog(nodesRef.current).flatMap((group) => group.entries)[0];
        await act(async () => expect(commands!.renameCanvasAsset(entry.key, "测试")).toBe(false));
        expect(commits).toBe(0); expect(nodesRef.current[0]).toBe(a);
        granted = true;
        await act(async () => expect(commands!.renameCanvasAsset(entry.key, "测试")).toBe(true));
        expect(commits).toBe(1); expect(nodesRef.current.map((node) => node.title)).toEqual(["测试 · A", "测试 · B"]);
        const version = entry.versions.find((version) => version.nodeId === "b" && version.label.endsWith("V1"))!;
        await act(async () => commands!.promoteCanvasAssetVersion(version));
        expect(commits).toBe(2); expect(nodesRef.current[1].metadata?.versionPrimary).toBe(true);
        expect(nodesRef.current[1].metadata?.storageKey).toBe("resource:old");
    } finally { canvasEditLeases.input = original; await view.cleanup(); }
});
