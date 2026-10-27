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
