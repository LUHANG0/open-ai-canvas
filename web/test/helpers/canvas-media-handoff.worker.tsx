import { mock } from "bun:test";
import { Window } from "happy-dom";

self.onmessage = async ({ data: scenario }) => {
    const dom = new Window({ url: "http://localhost/" });
    try {
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true }))
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        let scope = "account-a",
            calls = 0;
        let localResolves = 0,
            reportedErrors = 0;
        const started: string[] = [];
        const visibility: Array<(entries: { isIntersecting: boolean }[]) => void> = [];
        if (scenario === "cold-access-gate")
            Object.defineProperty(globalThis, "IntersectionObserver", {
                configurable: true,
                value: class {
                    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
                        visibility.push(callback);
                    }
                    observe() {}
                    disconnect() {}
                },
            });
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => scope }));
        mock.module("../../src/services/image-storage", () => ({ resolveImageUrl: async (_key: string, src: string) => (scenario === "local-recovery" ? (++localResolves === 1 ? "blob:first" : "blob:renewed") : src) }));
        mock.module("../../src/services/resource-blob-cache", () => ({ peekCachedResourceObjectUrl: () => "" }));
        mock.module("../../src/services/api/resources", () => ({
            resourceIdFromStorageKey: (key?: string) => (key?.startsWith("resource:") ? key.slice(9) : ""),
            resolveResourceAccessURL: (url: string) => url,
            peekResourceAccess: () => (scenario === "cold-access-gate" ? { resourceId: "fixture", requestedVariant: "original", actualVariant: "original", url: "/original" } : undefined),
            resourceAccessCacheExpiry: () => Infinity,
            refreshResource: async () => ({}),
            getResourceAccess: async (key: string, _purpose: string, variant: string) => {
                calls++;
                if (scenario === "thumbnail-access" && variant === "thumbnail") throw Error("thumbnail unavailable");
                if (scenario === "interest-scheduling") return { resourceId: key.slice(9), requestedVariant: variant, actualVariant: "original", url: "/" + key.slice(9) };
                return { resourceId: key.slice(9), requestedVariant: variant, actualVariant: variant, url: variant === "thumbnail" ? "/thumbnail" : "/original", originalWidth: 4000, originalHeight: 3000 };
            },
        }));
        mock.module("../../src/services/file-storage", () => ({ resolveVideoMediaUrl: async () => "" }));
        mock.module("../../src/services/canvas-video-preview", () => ({ hydrateCanvasVideoPreview: async () => undefined }));
        mock.module("../../src/components/video-player", () => ({ VideoPlayer: () => null }));
        mock.module("../../src/components/canvas/canvas-audio-player", () => ({ CanvasAudioPlayer: () => null }));
        mock.module("../../src/components/canvas/canvas-node-status-content", () => ({ ErrorContent: () => null, LoadingContent: () => null }));
        mock.module("../../src/components/canvas/canvas-node-action-context", () => ({ useCanvasNodeActions: () => ({}) }));
        class TestImage {
            naturalWidth = 4000;
            naturalHeight = 3000;
            complete = false;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            decoding = "";
            set src(value: string) {
                started.push(value);
                if (scenario === "interest-scheduling") return;
                this.complete = true;
                queueMicrotask(() => (value === "/thumbnail" ? this.onerror?.() : this.onload?.()));
            }
            decode() {
                return Promise.resolve();
            }
            removeAttribute() {}
        }
        Object.defineProperty(globalThis, "Image", { configurable: true, value: TestImage });
        URL.createObjectURL = () => "blob:controlled-upload";
        URL.revokeObjectURL = () => {};
        // Module loading follows DOM, scoped API and actual decoder boundary installation.
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { CachedResourceImage } = await import("../../src/components/cached-resource-image");
        const { ImageContent } = await import("../../src/components/canvas/canvas-node-media-content");
        const { registerUploadPreview } = await import("../../src/services/canvas-upload-preview");
        const { canvasThemes } = await import("../../src/lib/canvas-theme");
        const { CanvasNodeType } = await import("../../src/types/canvas");
        const { useCanvasMediaInterests } = await import("../../src/pages/canvas/use-canvas-media-interests");
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        if (scenario === "interest-scheduling") {
            const nodes = Array.from({ length: 8 }, (_, i) => ({
                id: `large-${i}`,
                type: CanvasNodeType.Image,
                title: "large",
                position: { x: 0, y: 0 },
                width: 240,
                height: 160,
                metadata: { storageKey: `resource:large-${i}`, content: "/large", naturalWidth: 4000, naturalHeight: 3000 },
            }));
            const poster = {
                id: "video",
                type: CanvasNodeType.Video,
                title: "video",
                position: { x: 0, y: 0 },
                width: 240,
                height: 160,
                metadata: { storageKey: "resource:video", videoPreview: { storageKey: "resource:poster", content: "/poster", width: 600, height: 400 } },
            };
            const candidates = [...nodes, poster];
            let immediate = new Set(candidates.map((node) => node.id));
            const selected = new Set<string>();
            function Interests() {
                useCanvasMediaInterests(candidates, immediate, 0.15, selected);
                return null;
            }
            await act(async () => root.render(<Interests />));
            if (started.length || calls) throw Error("spatial prewarm reordered the visible DOM's own loading path");
            immediate = new Set(["large-0"]);
            await act(async () => root.render(<Interests />));
            if (started[0] !== "/poster" || started.length !== 4 || calls !== 8 || started.includes("/large-0")) throw Error("offscreen prewarm lost its finite budget, cost hint or visible exclusion");
        } else if (scenario === "cold-access-gate") {
            const node = { id: "cold", type: CanvasNodeType.Image, title: "cold", position: { x: 0, y: 0 }, width: 240, height: 160, metadata: { storageKey: "resource:fixture", content: "/original", manualSize: true } };
            await act(async () => root.render(<ImageContent node={node} renderLOD="full" viewportScale={1} theme={canvasThemes.dark} isBatchRoot={false} batchCount={0} batchExpanded={false} batchOpening={false} batchRecovering={false} />));
            if (started.length || host.querySelector("img")?.getAttribute("src")) throw Error("access-only snapshot bypassed the cold image viewport gate");
            await act(async () => visibility.forEach((callback) => callback([{ isIntersecting: true }])));
            if (started[0] !== "/original") throw Error("cold image never joined the queue after viewport admission");
        } else if (scenario === "local-recovery") {
            await act(async () => root.render(<CachedResourceImage storageKey="image:fixture" eager onError={() => reportedErrors++} />));
            if (host.querySelector("img")?.getAttribute("src") !== "blob:first") throw Error("local source fixture failed to prepare");
            await act(async () => {
                host.querySelector("img")!.dispatchEvent(new dom.Event("error"));
            });
            if (host.querySelector("img")?.getAttribute("src") !== "blob:renewed" || localResolves !== 2 || reportedErrors) throw Error("local object URL renewal failed or reported an error before successful recovery");
        } else if (scenario === "upload-handoff") {
            const preview = registerUploadPreview("upload-node", new Blob(["pixels"]));
            preview.bind("resource:uploaded");
            const node = { id: "upload-node", type: CanvasNodeType.Image, title: "uploaded", position: { x: 0, y: 0 }, width: 240, height: 160, metadata: { storageKey: "resource:uploaded", content: "/original", manualSize: true } };
            const element = () => <ImageContent node={node} renderLOD="full" viewportScale={1} theme={canvasThemes.dark} isBatchRoot={false} batchCount={0} batchExpanded={false} batchOpening={false} batchRecovering={false} />;
            await act(async () => root.render(element()));
            if (host.querySelector("img")?.getAttribute("src") !== "blob:controlled-upload" || calls !== 0) throw Error("bound upload preview was replaced by remote access before its controlled handoff");
            scope = "account-b";
            await act(async () => root.render(element()));
            if (host.querySelector("img")?.getAttribute("src") === "blob:controlled-upload") throw Error("upload preview crossed account scope");
            preview.release();
        } else {
            await act(async () => root.render(<CachedResourceImage storageKey="resource:fixture" src="/stale" variant="thumbnail" eager />));
            if (host.querySelector("img")?.getAttribute("src") !== "/original" || started.at(-1) !== "/original") throw Error("CachedResourceImage failed to publish authorized original after thumbnail failure");
            if (started.includes("/stale")) throw Error("thumbnail recovery loaded untyped raw fallback");
        }
        await act(async () => root.unmount());
        self.postMessage({ scenario, passed: true });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.stack : String(error) });
    } finally {
        mock.restore();
        dom.happyDOM.abort();
    }
};
