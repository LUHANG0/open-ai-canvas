import { mock } from "bun:test";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import type { CanvasNodeData } from "../../src/types/canvas";
type AccessFixture = { url: string; actualVariant: "original" | "thumbnail"; originalWidth?: number; originalHeight?: number };

self.onmessage = async () => {
    const dom = new Window({ url: "http://localhost/" });
    let root: Root | undefined;
    try {
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true }))
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        Object.defineProperty(dom, "devicePixelRatio", { configurable: true, writable: true, value: 2 });
        const loads: { src: string; signal: AbortSignal; resolve: (image: HTMLImageElement) => void; reject: (error: Error) => void }[] = [];
        const accesses: { args: unknown[]; resolve: (access: AccessFixture) => void }[] = [];
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => "account-a" }));
        // Keep owner snapshots real; only loading/decode is externally controlled.
        const owner = await import("../../src/services/canvas-image-loader");
        mock.module("../../src/services/image-storage", () => ({ resolveImageUrl: async (_key: string, src: string) => src }));
        mock.module("../../src/services/canvas-image-loader", () => ({
            ...owner,
            isCanvasImageActive: () => false,
            subscribeCanvasImageActivity: () => () => {},
            prepareCanvasImage: (source: { src: string }, signal: AbortSignal) => {
                const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>();
                loads.push({ src: source.src, signal, resolve, reject });
                return promise;
            },
        }));
        mock.module("../../src/services/api/resources", () => ({
            peekResourceAccess: () => undefined,
            resourceAccessCacheExpiry: () => Infinity,
            resourceIdFromStorageKey: (key?: string) => (key?.startsWith("resource:") ? key.slice(9) : ""),
            resolveResourceAccessURL: (url: string) => url,
            refreshResource: async () => ({}),
            getResourceAccess: (...args: unknown[]) => {
                const { promise, resolve } = Promise.withResolvers<AccessFixture>();
                accesses.push({ args, resolve });
                return promise.then((value) => ({ ...value, resourceId: String(args[0]).slice(9), requestedVariant: args[2] }));
            },
        }));
        mock.module("../../src/services/canvas-upload-preview", () => ({ uploadPreviewUrl: () => "" }));
        mock.module("../../src/services/file-storage", () => ({ resolveVideoMediaUrl: async () => "" }));
        mock.module("../../src/services/canvas-video-preview", () => ({ hydrateCanvasVideoPreview: async () => undefined }));
        mock.module("../../src/components/video-player", () => ({ VideoPlayer: () => null }));
        mock.module("../../src/components/canvas/canvas-audio-player", () => ({ CanvasAudioPlayer: () => null }));
        mock.module("../../src/components/canvas/canvas-video-preview-image", () => ({ CanvasVideoPreviewImage: () => null }));
        mock.module("../../src/components/canvas/canvas-node-status-content", () => ({ ErrorContent: () => null, LoadingContent: () => null }));
        mock.module("../../src/components/canvas/canvas-node-action-context", () => ({ useCanvasNodeActions: () => ({}) }));
        const { act } = await import("react");
        // These test imports must follow DOM installation and mock.module registration;
        // static React DOM imports detect the wrong environment before the fixture exists.
        const { createRoot } = await import("react-dom/client");
        const { ImageContent, BatchPreviewImage, useNodeResourceUrl } = await import("../../src/components/canvas/canvas-node-media-content");
        const { RetainedCanvasImage } = await import("../../src/components/canvas/canvas-retained-image");
        const { canvasThemes } = await import("../../src/lib/canvas-theme");
        const { CanvasNodeType } = await import("../../src/types/canvas");
        const host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
        const assert = (ok: unknown, message: string) => {
            if (!ok) throw new Error(message);
        };
        const photo: CanvasNodeData = {
            id: "photo",
            type: CanvasNodeType.Image,
            title: "photo",
            position: { x: 0, y: 0 },
            width: 480,
            height: 320,
            metadata: { content: "https://libtv-res.liblib.art/photo.png", naturalWidth: 2400, naturalHeight: 1600, importSource: { provider: "libtv", projectUuid: "fixture", nodeKey: "photo", batchId: "batch" } },
        };
        const currentNode = photo;
        const image = () => host.querySelector<HTMLImageElement>("img")!;
        const render = (scale: number, lod: "full" | "preview" | "shell" = "full") =>
            act(async () => root!.render(<ImageContent node={currentNode} viewportScale={scale} renderLOD={lod} theme={canvasThemes.dark} isBatchRoot={false} batchCount={0} batchExpanded={false} batchOpening={false} batchRecovering={false} />));
        const decode = (load = loads.at(-1)!, width = 2400, height = 1600) => act(async () => load.resolve({ naturalWidth: width, naturalHeight: height } as HTMLImageElement));
        await render(1);
        assert(loads.at(-1)?.src.includes("image%2Fresize%2Cw_960"), "960px variant not selected at exact DPR boundary");
        const preview = loads.at(-1)!.src;
        await decode();
        await render(1.01);
        const stale = loads.at(-1)!;
        assert(stale.src === photo.metadata!.content && image().getAttribute("src") === preview, "upgrade discarded decoded preview or missed original");
        await render(1);
        assert(stale.signal.aborted, "downgrade did not cancel stale original preparation");
        await decode(stale, 17, 19);
        assert(image().getAttribute("src") === preview, "late cancelled original replaced active preview");
        await decode();
        Object.defineProperty(dom, "devicePixelRatio", { configurable: true, writable: true, value: 3 });
        await act(async () => dom.dispatchEvent(new dom.Event("resize")));
        assert(loads.at(-1)!.src === photo.metadata!.content && image().getAttribute("src") === preview, "DPR change failed to upgrade with retention");
        await decode();
        assert(image().getAttribute("src") === photo.metadata!.content, "decoded upgrade was not presented");
        await render(1, "shell");
        assert(image().getAttribute("src") === photo.metadata!.content, "shell discarded the decoded image");
        await act(async () => root!.render(<BatchPreviewImage node={photo} theme={canvasThemes.dark} />));
        const batch = loads.at(-1)!;
        assert(batch.src.includes("image%2Fresize%2Cw_960"), "batch bypassed preview source/queue");
        await act(async () => root!.render(null));
        assert(batch.signal.aborted, "batch removal did not cancel its queued preparation");
        let fitted = 0;
        const retained = () => (
            <RetainedCanvasImage identity="remote-thumbnail" src="/expired-thumb.png" storageKey="resource:remote" variant="thumbnail" originalSize={{}} fitToImage={() => fitted++} className="test" loading={false} theme={canvasThemes.dark} />
        );
        owner.registerCanvasImageSource("/expired-thumb.png", "remote", "thumbnail");
        owner.registerCanvasImageSource("/failed-thumb.png", "remote", "thumbnail");
        await act(async () => root!.render(retained()));
        await decode(loads.at(-1)!, 960, 640);
        assert(fitted === 0, "thumbnail decode overwrote unknown original dimensions");
        await act(async () =>
            root!.render(
                <RetainedCanvasImage
                    identity="remote-thumbnail-next"
                    retentionKey="remote-thumbnail"
                    src="/failed-thumb.png"
                    storageKey="resource:remote"
                    variant="thumbnail"
                    originalSize={{}}
                    fitToImage={() => fitted++}
                    className="test"
                    loading={false}
                    theme={canvasThemes.dark}
                />,
            ),
        );
        await act(async () => loads.at(-1)!.reject(new Error("expired")));
        assert(accesses.at(-1)!.args[2] === "thumbnail", "automatic recovery silently upgraded to original");
        await act(async () => accesses.at(-1)!.resolve({ url: "/refreshed-thumb.png", actualVariant: "thumbnail" }));
        await act(async () => loads.at(-1)!.reject(new Error("offline")));
        assert(host.textContent?.includes("预览图加载失败") && image().getAttribute("src") === "/expired-thumb.png", "thumbnail failure lost truthful feedback or its retained preview");
        await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
        const refreshOptions = accesses.at(-1)!.args[4];
        assert(accesses.at(-1)!.args[2] === "thumbnail" && typeof refreshOptions === "object" && refreshOptions !== null && "forceRefresh" in refreshOptions && refreshOptions.forceRefresh === true, "manual retry did not preserve requested variant");
        await act(async () => accesses.at(-1)!.resolve({ url: "/original-fallback.png", actualVariant: "original" }));
        await decode();
        assert(fitted === 1, "actual-original fallback lost intrinsic dimension measurement");
        function AccessProbe({ node, eager }: { node: CanvasNodeData; eager: boolean }) {
            const source = useNodeResourceUrl(node, eager, "thumbnail");
            return <output>{source.url}</output>;
        }
        const remote = { ...photo, metadata: { storageKey: "resource:old" } };
        await act(async () => root!.render(<AccessProbe node={remote} eager />));
        const oldAccess = accesses.at(-1)!;
        await act(async () => root!.render(<AccessProbe node={{ ...remote, metadata: { storageKey: "resource:new" } }} eager />));
        await act(async () => accesses.at(-1)!.resolve({ url: "/new.png", actualVariant: "original" }));
        await act(async () => oldAccess.resolve({ url: "/old.png", actualVariant: "original" }));
        assert(host.textContent === "/new.png", "cancelled access result replaced current source");
        await act(async () => root!.render(<AccessProbe node={remote} eager={false} />));
        assert(!host.textContent, "disabled media kept publishing remote source");
        self.postMessage({ upgraded: true, retained: true, cancelled: true, dpr: true, batchQueued: true, retryVariant: true, measuredOriginal: true, lateAccessIgnored: true });
        await act(async () => root!.unmount());
        root = undefined;
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.stack : String(error) });
    } finally {
        mock.restore();
        dom.happyDOM.abort();
    }
};
