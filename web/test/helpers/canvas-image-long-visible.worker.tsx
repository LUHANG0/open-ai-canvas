import { mock } from "bun:test";
import { Window } from "happy-dom";

self.onmessage = async ({ data: mode }) => {
    const dom = new Window({ url: "http://localhost/" });
    const originalNow = Date.now;
    try {
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true }))
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => "round2-account" }));
        mock.module("../../src/services/api/resources", () => ({
            peekResourceAccess: () => undefined,
            resourceAccessCacheExpiry: () => Infinity,
            resourceIdFromStorageKey: (key?: string) => (key?.startsWith("resource:") ? key.slice(9) : ""),
            resolveResourceAccessURL: (url: string) => url,
            getResourceAccess: async () => ({ resourceId: "poster", requestedVariant: "original", actualVariant: "original", url: "/poster.png" }),
        }));
        mock.module("../../src/services/image-storage", () => ({ resolveImageUrl: async () => "" }));
        class TestImage {
            naturalWidth = 120;
            naturalHeight = 80;
            complete = false;
            onload: (() => void) | null = null;
            onerror = null;
            decoding = "";
            set src(_: string) {
                this.complete = true;
                queueMicrotask(() => this.onload?.());
            }
            decode() {
                return Promise.resolve();
            }
            removeAttribute() {}
        }
        Object.defineProperty(globalThis, "Image", { configurable: true, value: TestImage });
        // DOM detection and mocks must precede loading React DOM and product modules.
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { renderToString } = await import("react-dom/server");
        const { RetainedCanvasImage } = await import("../../src/components/canvas/canvas-retained-image");
        const { peekCanvasImage } = await import("../../src/services/canvas-image-loader");
        const { CanvasVideoPreviewImage } = await import("../../src/components/canvas/canvas-video-preview-image");
        const { canvasThemes } = await import("../../src/lib/canvas-theme");
        const { CanvasNodeType } = await import("../../src/types/canvas");
        const node = {
            id: "video",
            type: CanvasNodeType.Video,
            title: "fixture",
            position: { x: 0, y: 0 },
            width: 120,
            height: 80,
            metadata: { storageKey: "resource:video", videoPreview: { storageKey: "resource:poster", content: "/poster.png", width: 120, height: 80 } },
        };
        const element = () =>
            mode === "poster" ? <CanvasVideoPreviewImage node={node} eager decoding="async" /> : <RetainedCanvasImage identity="media" src="/photo.png" originalSize={{}} fitToImage={() => {}} className="test" loading={false} theme={canvasThemes.dark} />;
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        await act(async () => root.render(element()));
        if (!host.querySelector("img")?.getAttribute("src")) throw Error("fixture never prepared");
        Date.now = () => originalNow() + 61_000;
        await act(async () => root.unmount());
        const restored = renderToString(element());
        const expected = mode === "poster" ? "/poster.png" : "/photo.png";
        if (!restored.includes(`src="${expected}"`)) throw Error(`${mode}: long-visible media lost presentation on first remount render`);
        if (mode === "poster" && !restored.includes('decoding="sync"')) throw Error("poster restored with asynchronous decoding");
        Date.now = () => originalNow() + 122_000;
        if (peekCanvasImage(expected)) throw Error("detached decoded pixels survived their budget lifetime");
        if (!renderToString(element()).includes(`src="${expected}"`)) throw Error("valid presentation disappeared after decoded pixels expired");
        self.postMessage({ restored: true, pixelsExpired: true });
    } catch (error) {
        self.postMessage({ error: String(error) });
    } finally {
        Date.now = originalNow;
        mock.restore();
        dom.happyDOM.abort();
    }
};
