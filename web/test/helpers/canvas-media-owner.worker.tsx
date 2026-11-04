import { mock } from "bun:test";
import { Window } from "happy-dom";

self.onmessage = async ({ data: mode }) => {
    const dom = new Window({ url: "http://localhost/" });
    const originalNow = Date.now;
    let now = originalNow();
    try {
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true }))
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        Date.now = () => now;
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => "owner-test" }));
        mock.module("../../src/services/api/resources", () => ({
            peekResourceAccess: () => ({ resourceId: "poster", requestedVariant: "original", actualVariant: "original", url: "/prepared.png" }),
            resourceAccessCacheExpiry: () => Infinity,
            resourceIdFromStorageKey: (key?: string) => (key?.startsWith("resource:") ? key.slice(9) : ""),
            resolveResourceAccessURL: (url: string) => url,
            getResourceAccess: async () => ({ resourceId: "poster", requestedVariant: "original", actualVariant: "original", url: "/prepared.png" }),
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
        // Module initialization must follow the mocked account and DOM platform installation.
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { renderToString } = await import("react-dom/server");
        const loader = await import("../../src/services/canvas-image-loader");
        const { RetainedCanvasImage } = await import("../../src/components/canvas/canvas-retained-image");
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
            metadata: { storageKey: "resource:video", videoPreview: { storageKey: "resource:poster", content: "/prepared.png", width: 120, height: 80 } },
        };
        const element = () =>
            mode === "poster" ? (
                <CanvasVideoPreviewImage node={node} eager />
            ) : (
                <RetainedCanvasImage identity="media" retentionKey="media" src="/prepared.png" originalSize={{}} fitToImage={() => {}} className="fixture" loading={false} theme={canvasThemes.dark} />
            );
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        await act(async () => root.render(element()));
        if (host.querySelector("img")?.getAttribute("src") !== "/prepared.png") throw Error("fixture never prepared");
        await act(async () => root.unmount());
        now += 60_001;
        await loader.prepareCanvasImage(loader.registerCanvasImageSource("/prepared.png", mode === "poster" ? "poster" : "/prepared.png"), new AbortController().signal);
        if (!renderToString(element()).includes('src="/prepared.png"')) throw Error(`${mode}: warm preparation cannot bridge expired presentation on first render`);
        self.postMessage({ mode, passed: true });
    } catch (error) {
        self.postMessage({ error: String(error) });
    } finally {
        Date.now = originalNow;
        mock.restore();
        dom.happyDOM.abort();
    }
};
