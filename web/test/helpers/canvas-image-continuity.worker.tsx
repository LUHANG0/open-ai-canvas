import { mock } from "bun:test";
import { Window } from "happy-dom";

self.onmessage = async () => {
    const dom = new Window({ url: "http://localhost/" });
    try {
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true }))
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        let scope = "a";
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => scope }));
        mock.module("../../src/services/api/resources", () => ({
            peekResourceAccess: () => undefined,
            resourceAccessCacheExpiry: () => Infinity,
            getResourceAccess: async () => ({ url: "" }),
            resourceIdFromStorageKey: () => "",
            resolveResourceAccessURL: (s: string) => s,
        }));
        mock.module("../../src/services/image-storage", () => ({ resolveImageUrl: async () => "" }));
        class TestImage {
            naturalWidth = 120;
            naturalHeight = 80;
            complete = false;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
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
        // React DOM and product modules must load after DOM installation and mock registration.
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { renderToString } = await import("react-dom/server");
        const { RetainedCanvasImage } = await import("../../src/components/canvas/canvas-retained-image");
        const { canvasThemes } = await import("../../src/lib/canvas-theme");
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        const element = (key = "media-a", src = "") => (
            <RetainedCanvasImage identity={`${scope}:${key}:thumbnail`} retentionKey={`${scope}:${key}`} src={src} originalSize={{}} fitToImage={() => {}} className="test" loading={!src} theme={canvasThemes.dark} />
        );
        await act(async () => root.render(element("media-a", "/prepared.png")));
        if (host.querySelector("img")?.getAttribute("src") !== "/prepared.png") throw Error("fixture failed to prepare");
        await act(async () => root.unmount());
        const { prepareCanvasImage, registerCanvasImageSource, peekCanvasImage } = await import("../../src/services/canvas-image-loader");
        // Evict the original from the 48-image decoded cache, not the presentation metadata.
        for (let i = 0; i < 50; i++) await prepareCanvasImage(registerCanvasImageSource(`/churn-${i}.png`), new AbortController().signal);
        const first = renderToString(element());
        if (!first.includes('src="/prepared.png"') || first.includes("visibility:hidden")) throw Error("warm remount first render discards previously decoded media before access resolves");
        if (first.includes('role="status"')) throw Error("warm remount replays loading feedback");
        if (renderToString(element("media-b")).includes("/prepared.png")) throw Error("different media reused stale presentation");
        const now = Date.now;
        try {
            Date.now = () => now() + 60_001;
            if (peekCanvasImage("/prepared.png")) throw Error("detached decoded pixels survived TTL");
            if (!renderToString(element()).includes('src="/prepared.png"')) throw Error("valid presentation disappeared with decoded pixel TTL");
        } finally {
            Date.now = now;
        }
        const nextRoot = createRoot(host);
        await act(async () => nextRoot.render(element("media-a", "/prepared.png")));
        scope = "b";
        if (renderToString(element()).includes("/prepared.png")) throw Error("presentation crossed account");
        await act(async () => nextRoot.unmount());
        const boundedRoot = createRoot(host);
        for (let i = 0; i < 257; i++) await act(async () => boundedRoot.render(element(`bounded-${i}`, `/bounded-${i}.png`)));
        await act(async () => boundedRoot.unmount());
        if (renderToString(element("bounded-0")).includes("/bounded-0.png")) throw Error("old presentation was not evicted at capacity");
        if (!renderToString(element("bounded-256")).includes("/bounded-256.png")) throw Error("capacity eviction discarded newest presentation");
        self.postMessage({ remount: true, mediaIsolated: true, scopeIsolated: true });
    } catch (error) {
        self.postMessage({ error: String(error) });
    } finally {
        mock.restore();
        dom.happyDOM.abort();
    }
};
