import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

// Keep browser globals and media substitutes in a separate process, as with
// canvas-node-activation, so other UI checks cannot replace these exports.
const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    MutationObserver: dom.MutationObserver,
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    SVGElement: dom.SVGElement,
    Element: dom.Element,
    Node: dom.Node,
    ShadowRoot: dom.ShadowRoot,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
mock.module("../../src/services/canvas-video-preview", () => ({ hydrateCanvasVideoPreview: async () => null }));
mock.module("../../src/components/video-player", () => ({ VideoPlayer: () => <video /> }));
mock.module("../../src/components/canvas/canvas-video-preview-image", () => ({ CanvasVideoPreviewImage: () => <img alt="fixture poster" /> }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasNodeContent } = await import("../../src/components/canvas/canvas-node-content");
const { CanvasPlaybackProvider } = await import("../../src/components/canvas/canvas-playback-context");
const { canvasThemes } = await import("../../src/lib/canvas-theme");
import type { CanvasNodeContentProps } from "../../src/components/canvas/canvas-node-content";
import type { CanvasNodeData } from "../../src/types/canvas";

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
});

test("the real content router keeps one decoded video poster across overview levels", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const node = {
        id: "video-lod",
        type: "video",
        title: "fixture",
        position: { x: 0, y: 0 },
        width: 420,
        height: 240,
        metadata: { content: "/fixture.mp4", storageKey: "video:fixture", previewContent: "/fixture.png", status: "success" },
    } as CanvasNodeData;
    try {
        let poster: HTMLImageElement | null = null;
        for (const renderLOD of ["full", "preview", "shell", "preview", "full", "preview", "full"] as const) {
            const props = { node, theme: canvasThemes.light, renderLOD } as CanvasNodeContentProps;
            await act(async () =>
                root.render(
                    <CanvasPlaybackProvider>
                        <CanvasNodeContent {...props} />
                    </CanvasPlaybackProvider>,
                ),
            );
            const current = host.querySelector("img");
            expect(current).not.toBeNull();
            if (!poster) poster = current;
            expect(current === poster).toBe(true);
            expect(poster!.isConnected).toBe(true);
            expect(host.querySelector("video")).toBeNull();
        }
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
