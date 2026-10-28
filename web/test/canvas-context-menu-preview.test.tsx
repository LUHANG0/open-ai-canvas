import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// React DOM and motion must initialize after the DOM globals; static imports detect a server environment.
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasNodeContextMenu } = await import("../src/components/canvas/canvas-context-menu");
const { CanvasNodeType } = await import("../src/types/canvas");
afterAll(() => {
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    dom.happyDOM.abort();
});

test("image and video context previews accept stored assets but reject empty nodes and passive posters", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const noop = () => {};
    const handlers = { onClose: noop, onAddNode: noop, onAddFolder: noop, onChooseStyle: noop, onOpenPrevis: noop, onUpload: noop, onOpenAssets: noop, onOpenProjectCharacters: noop, onUndo: noop, onRedo: noop, onPaste: noop, onCopyNode: noop, onCreateGenerationCopy: noop, onDuplicate: noop, onDelete: noop, onSaveAsset: noop, onViewMedia: noop, onEditText: noop, onOpenDrawing: noop, onGenerateImage: noop, onCopyContent: noop, onCopyMediaUrl: noop, onUploadToArkPrivateAsset: noop, onSetAssetCategory: noop, onToggleFrame: noop };
    try {
        for (const type of [CanvasNodeType.Image, CanvasNodeType.Video]) {
            for (const [metadata, enabled] of [[{ storageKey: "resource:asset" }, true], [{ content: "/media" }, true], [{}, false], [{ previewContent: "/poster.jpg" }, false]] as const) {
                await act(async () => root.render(<CanvasNodeContextMenu {...handlers} menu={{ type: "node", nodeId: "media", x: 20, y: 80 }} node={{ id: "media", type, title: "媒体", position: { x: 0, y: 0 }, width: 320, height: 180, metadata }} canUndo={false} canRedo={false} canPaste={false} />));
                const preview = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("放大预览"));
                expect(preview).toBeDefined();
                expect(preview!.disabled).toBe(!enabled);
            }
        }
    } finally { await act(async () => root.unmount()); host.remove(); }
});


test("multi-selection download works from nodes and canvas, reports the eligible count and disables busy or empty batches", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const noop = () => {}; let downloads = 0; let closed = 0;
    const handlers = { onClose: () => closed++, onAddNode: noop, onAddFolder: noop, onChooseStyle: noop, onOpenPrevis: noop, onUpload: noop, onOpenAssets: noop, onOpenProjectCharacters: noop, onUndo: noop, onRedo: noop, onPaste: noop, onCopyNode: noop, onCreateGenerationCopy: noop, onDuplicate: noop, onDelete: noop, onSaveAsset: noop, onViewMedia: noop, onEditText: noop, onOpenDrawing: noop, onGenerateImage: noop, onCopyContent: noop, onCopyMediaUrl: noop, onUploadToArkPrivateAsset: noop, onSetAssetCategory: noop, onToggleFrame: noop, onDownloadSelection: () => downloads++ };
    try {
        for (const type of ["node", "canvas"] as const) {
            await act(async () => root.render(<CanvasNodeContextMenu {...handlers} menu={{ type, nodeId: "media", x: 20, y: 80 }} selectedCount={4} downloadableSelectionCount={2} canUndo={false} canRedo={false} canPaste={false} />));
            const button = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("下载 2 个资源"))!;
            expect(button.disabled).toBe(false); expect(button.textContent).toContain("跳过 2 个");
            await act(async () => button.click());
        }
        expect(downloads).toBe(2); expect(closed).toBe(2);
        for (const [eligible, busy] of [[0, false], [2, true]] as const) {
            await act(async () => root.render(<CanvasNodeContextMenu {...handlers} menu={{ type: "node", nodeId: "media", x: 20, y: 80 }} selectedCount={4} downloadableSelectionCount={eligible} downloadingSelection={busy} canUndo={false} canRedo={false} canPaste={false} />));
            const button = [...host.querySelectorAll("button")].find((button) => /下载资源|正在启动下载/.test(button.textContent || ""))!;
            expect(button.disabled).toBe(true);
        }
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("keeps tall selection menus fully visible on short screens and after resize", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const previousHeight = Object.getOwnPropertyDescriptor(dom, "innerHeight");
    const originalRect = dom.HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(dom, "innerHeight", { configurable: true, value: 844 });
    dom.HTMLElement.prototype.getBoundingClientRect = function () {
        return this.hasAttribute("data-canvas-context-menu") ? { x: 0, y: 0, top: 0, left: 0, right: 224, bottom: 419, width: 224, height: 419, toJSON() { return {}; } } : originalRect.call(this);
    };
    const noop = () => {};
    const handlers = { onClose: noop, onAddNode: noop, onAddFolder: noop, onChooseStyle: noop, onOpenPrevis: noop, onUpload: noop, onOpenAssets: noop, onOpenProjectCharacters: noop, onUndo: noop, onRedo: noop, onPaste: noop, onCopyNode: noop, onCreateGenerationCopy: noop, onDuplicate: noop, onDelete: noop, onSaveAsset: noop, onViewMedia: noop, onEditText: noop, onOpenDrawing: noop, onGenerateImage: noop, onCopyContent: noop, onCopyMediaUrl: noop, onUploadToArkPrivateAsset: noop, onSetAssetCategory: noop, onToggleFrame: noop, onDownloadSelection: noop };
    try {
        await act(async () => root.render(<CanvasNodeContextMenu {...handlers} menu={{ type: "canvas", x: 350, y: 810 }} selectedCount={7} downloadableSelectionCount={4} canUndo={false} canRedo={false} canPaste={false} />));
        const menu = host.querySelector<HTMLElement>("[data-canvas-context-menu]")!;
        expect(Number.parseFloat(menu.style.top) + 419).toBeLessThanOrEqual(844 - 12);
        Object.defineProperty(dom, "innerHeight", { configurable: true, value: 600 });
        await act(async () => dom.dispatchEvent(new dom.Event("resize")));
        expect(Number.parseFloat(menu.style.top) + 419).toBeLessThanOrEqual(600 - 12);
    } finally {
        await act(async () => root.unmount()); host.remove(); dom.HTMLElement.prototype.getBoundingClientRect = originalRect;
        if (previousHeight) Object.defineProperty(dom, "innerHeight", previousHeight); else Reflect.deleteProperty(dom, "innerHeight");
    }
});
