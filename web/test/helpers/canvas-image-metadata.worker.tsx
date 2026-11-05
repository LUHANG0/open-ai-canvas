import { mock } from "bun:test";
import { Window } from "happy-dom";

self.onmessage = async ({ data: scenario }) => {
    const dom = new Window({ url: "http://localhost/" });
    const realNow = Date.now;
    let now = realNow(),
        scope = "account-a",
        auto = true,
        failAccess = false,
        accessCalls = 0;
    const images: TestImage[] = [];
    class TestImage {
        naturalWidth = 4000;
        naturalHeight = 3000;
        complete = false;
        decoding = "";
        src = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        decoded = Promise.withResolvers<void>();
        constructor() {
            images.push(this);
            if (auto) queueMicrotask(() => this.finish());
        }
        finish() {
            this.complete = true;
            this.onload?.();
            this.decoded.resolve();
        }
        decode() {
            return this.decoded.promise;
        }
        removeAttribute() {
            this.src = "";
        }
    }
    try {
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true }))
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        Date.now = () => now;
        Object.defineProperty(globalThis, "Image", { configurable: true, value: TestImage });
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => scope }));
        mock.module("../../src/services/image-storage", () => ({ resolveImageUrl: async (_key: string, src: string) => src }));
        const access = (key: string, variant: string) => ({ resourceId: key.slice(9), requestedVariant: variant, actualVariant: variant, url: `/${key.slice(9)}-${variant}`, originalWidth: 4000, originalHeight: 3000 });
        mock.module("../../src/services/resource-blob-cache", () => ({ peekCachedResourceObjectUrl: () => "" }));
        mock.module("../../src/services/api/resources", () => ({
            resourceIdFromStorageKey: (key?: string) => (key?.startsWith("resource:") ? key.slice(9) : ""),
            resolveResourceAccessURL: (src: string) => src,
            peekResourceAccess: (key: string, variant: string) => access(key, variant),
            resourceAccessCacheExpiry: () => now + 300_000,
            getResourceAccess: async (key: string, _purpose: string, variant: string) => {
                accessCalls++;
                if (failAccess) throw Error("forbidden");
                return access(key, variant);
            },
        }));
        // React DOM and owner modules must initialize after DOM globals and scoped API mocks.
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { renderToString } = await import("react-dom/server");
        const owner = await import("../../src/services/canvas-image-loader");
        const { useCanvasMediaImage } = await import("../../src/components/canvas/use-canvas-media-image");
        const assert = (value: unknown, message: string) => {
            if (!value) throw Error(message);
        };
        const prepare = async (src: string, id?: string, expiry = Infinity) => {
            const source = owner.registerCanvasImageSource(src, id, "original", expiry);
            await owner.prepareCanvasImage(source, new AbortController().signal);
            return source;
        };
        function Surface({ id = "media", storageKey, src = "", variant = "original", enabled = true }: { id?: string; storageKey?: string; src?: string; variant?: "original" | "thumbnail"; enabled?: boolean }) {
            const media = useCanvasMediaImage({ identity: `${scope}:${id}:${storageKey || src}:${variant}`, retentionKey: id, storageKey, src, variant, enabled });
            return <img src={media.src || undefined} onError={media.imageError} data-failed={media.failed} />;
        }
        const host = document.createElement("div");
        document.body.append(host);
        let root = createRoot(host);
        if (scenario === "error-cleanup" || scenario === "error-recovery") {
            await act(async () =>
                root.render(
                    <>
                        <Surface key="a" id="a" storageKey="resource:shared" />
                        <Surface key="b" id="b" storageKey="resource:shared" />
                    </>,
                ),
            );
            assert(host.querySelector("img")?.getAttribute("src") === "/shared-original", "shared fixture did not prepare");
            failAccess = scenario === "error-cleanup";
            const calls = accessCalls;
            await act(async () => host.querySelector("img")!.dispatchEvent(new dom.Event("error")));
            assert(accessCalls - calls === 1, "image error did not use exactly one forced refresh");
            if (scenario === "error-recovery") {
                assert(host.querySelector("img")?.getAttribute("src") === "/shared-original", "successful refresh did not restore presentation");
                await act(async () => root.unmount());
                assert(renderToString(<Surface id="a" storageKey="resource:shared" enabled={false} />).includes('src="/shared-original"'), "successful refresh was not retained");
            } else {
                assert(!host.querySelector("img")?.getAttribute("src"), "failed URL reappeared during old effect cleanup");
                await act(async () => root.render(<Surface key="a" id="a" storageKey="resource:shared" />));
                await act(async () => root.unmount());
                assert(!renderToString(<Surface id="b" storageKey="resource:shared" enabled={false} />).includes('src="/shared-original"'), "another consumer's cleanup resurrected revoked URL");
                assert(!renderToString(<Surface id="a" storageKey="resource:shared" enabled={false} />).includes('src="/shared-original"'), "failed presentation survived remount");
            }
        } else if (scenario === "variant-renewal") {
            await act(async () => root.render(<Surface storageKey="resource:quality" variant="thumbnail" />));
            assert(host.querySelector("img")?.getAttribute("src") === "/quality-thumbnail", "preview fixture did not prepare");
            auto = false;
            await act(async () => root.render(<Surface storageKey="resource:quality" variant="original" />));
            assert(host.querySelector("img")?.getAttribute("src") === "/quality-thumbnail", "same media preview vanished while original prepared");
            await act(async () => images.at(-1)!.finish());
            assert(host.querySelector("img")?.getAttribute("src") === "/quality-original", "prepared original did not replace preview");
            await act(async () => root.unmount());
            now += 60_001;
            assert(!owner.peekCanvasImage("/quality-original"), "fixture retained detached pixels beyond TTL");
            assert(renderToString(<Surface storageKey="resource:quality" enabled={false} />).includes('src="/quality-original"'), "original quality was downgraded after pixel expiry");
        } else if (scenario === "resource-switch") {
            await act(async () => root.render(<Surface storageKey="resource:first" />));
            auto = false;
            await act(async () => root.render(<Surface storageKey="resource:second" />));
            assert(!host.querySelector("img")?.getAttribute("src"), "resource replacement displayed old media");
            await act(async () => root.unmount());
        } else {
            await act(async () => root.unmount());
            if (scenario.startsWith("shared-")) {
                auto = false;
                const first = owner.registerCanvasImageSource("/shared", "shared", "original", now + 300_000, { requestedVariant: "thumbnail" });
                const firstResult = owner.prepareCanvasImage(first, new AbortController().signal).then(
                    () => "ready",
                    (error) => error.name,
                );
                const second = owner.registerCanvasImageSource("/shared", "shared", "original", scenario === "shared-expired" ? now + 1 : now + 300_000);
                const controller = new AbortController();
                const secondResult = owner.prepareCanvasImage(second, controller.signal).then(
                    () => "ready",
                    (error) => error.name,
                );
                assert(images.length === 1, "requested variants did not share physical preparation");
                if (scenario === "shared-cancelled") controller.abort();
                if (scenario === "shared-expired") now += 2;
                if (scenario === "shared-revoked") owner.forgetImagePresentation("/shared");
                images[0].finish();
                const results = await Promise.all([firstResult, secondResult]);
                owner.rememberImagePresentation("shared-presentation", "/shared");
                if (scenario === "shared-variants") {
                    assert(
                        results.every((result) => result === "ready"),
                        "valid shared consumers did not both prepare",
                    );
                    assert(owner.getImagePresentation("shared-presentation") === "/shared", "successful second capability had no presentation evidence");
                } else {
                    assert(results[1] !== "ready", "cancelled, expired or revoked consumer was published");
                    assert(owner.getImagePresentation("shared-presentation") === "", "invalid shared consumer granted presentation evidence");
                    if (scenario === "shared-revoked") assert(results[0] === "AbortError", "revoked first consumer survived late decode");
                    else assert(results[0] === "ready", "invalid second consumer cancelled valid first consumer");
                }
            } else if (scenario === "cold-descriptor") {
                owner.registerCanvasImageSource("/cold", "cold");
                const key = JSON.stringify([scope, "", "cold"]);
                owner.rememberImagePresentation(key, "/cold");
                assert(!renderToString(<Surface id="cold" enabled={false} />).includes('src="/cold"'), "registered cold URL became a successful presentation");
            } else if (scenario === "expiry-no-extension") {
                const source = await prepare("/signed", "signed", now + 1000);
                const key = JSON.stringify([scope, "", "signed"]);
                owner.rememberImagePresentation(key, source.src);
                assert(renderToString(<Surface id="signed" enabled={false} />).includes('src="/signed"'), "valid signed fixture was not reusable");
                const renewed = owner.registerCanvasImageSource("/signed", "signed", "original", now + 300_000);
                owner.rememberImagePresentation(key, renewed.src);
                now += 1001;
                assert(!renderToString(<Surface id="signed" enabled={false} />).includes('src="/signed"'), "registration alone extended old presentation capability");
                await owner.prepareCanvasImage(renewed, new AbortController().signal);
                owner.rememberImagePresentation(key, renewed.src);
                assert(renderToString(<Surface id="signed" enabled={false} />).includes('src="/signed"'), "successful renewal could not publish new capability");
            } else if (scenario === "blob") {
                await prepare("blob:temporary");
                owner.rememberImagePresentation(JSON.stringify([scope, "", "blob"]), "blob:temporary");
                assert(!renderToString(<Surface id="blob" enabled={false} />).includes('src="blob:temporary"'), "revocable blob entered session presentation retention");
            } else if (scenario === "scope") {
                await prepare("/account-image");
                owner.rememberImagePresentation(JSON.stringify([scope, "", "scoped"]), "/account-image");
                scope = "account-b";
                assert(!renderToString(<Surface id="scoped" enabled={false} />).includes('src="/account-image"'), "presentation crossed account boundary");
            } else if (scenario === "metadata-lru") {
                for (let i = 0; i < 256; i++) {
                    const src = `/bounded-${i}`;
                    await prepare(src);
                    owner.rememberImagePresentation(JSON.stringify([scope, "", `bounded-${i}`]), src);
                }
                assert(renderToString(<Surface id="bounded-0" enabled={false} />).includes('src="/bounded-0"'), "metadata disappeared with pixel-budget eviction");
                await prepare("/bounded-256");
                owner.rememberImagePresentation(JSON.stringify([scope, "", "bounded-256"]), "/bounded-256");
                assert(!renderToString(<Surface id="bounded-1" enabled={false} />).includes('src="/bounded-1"'), "least recently used presentation was not evicted at capacity");
                assert(renderToString(<Surface id="bounded-0" enabled={false} />).includes('src="/bounded-0"'), "recently reused presentation was evicted instead of LRU");
                assert(owner.canvasImagePreparationStats().presentations === 256, "session metadata exceeded bounded capacity");
            }
        }
        owner.disposeCanvasImageSession();
        self.postMessage({ scenario, passed: true });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.stack : String(error) });
    } finally {
        Date.now = realNow;
        mock.restore();
        dom.happyDOM.abort();
    }
};
