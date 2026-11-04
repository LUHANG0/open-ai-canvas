import { mock } from "bun:test";

type AccessFixture = { resourceId: string; requestedVariant: string; actualVariant: string; url: string; refreshAt: string };

self.onmessage = async ({ data: scenario }) => {
    const realNow = Date.now;
    let now = realNow(),
        scope = "account-a",
        auto = false;
    const images: TestImage[] = [];
    class TestImage {
        naturalWidth = 1000;
        naturalHeight = 1000;
        complete = false;
        src = "";
        decoding = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        decoded = Promise.withResolvers<void>();
        constructor() {
            images.push(this);
            if (auto)
                queueMicrotask(() => {
                    this.onload?.();
                    this.decoded.resolve();
                });
        }
        decode() {
            return this.decoded.promise;
        }
        removeAttribute() {
            this.src = "";
        }
    }
    try {
        Date.now = () => now;
        Object.defineProperty(globalThis, "Image", { configurable: true, value: TestImage });
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => scope }));
        let calls = 0;
        let access: (id: string, variant: string) => Promise<AccessFixture> = async (id, variant) => ({ resourceId: id, requestedVariant: variant, actualVariant: variant, url: `/resource-${id}`, refreshAt: new Date(now + 3600000).toISOString() });
        mock.module("../../src/services/api/resources", () => ({
            resourceIdFromStorageKey: (key?: string) => (key?.startsWith("resource:") ? key.slice(9) : ""),
            resolveResourceAccessURL: (src: string) => src,
            peekResourceAccess: () => undefined,
            resourceAccessCacheExpiry: (value: AccessFixture) => (value.refreshAt ? Date.parse(value.refreshAt) : Infinity),
            getResourceAccess: async (key: string, _purpose: string, variant: string) => {
                calls++;
                return access(key.slice(9), variant);
            },
        }));
        mock.module("../../src/services/image-storage", () => ({ resolveImageUrl: async (_key: string, src: string) => src }));
        // Real owner and source modules must initialize after the scoped platform/API boundaries.
        const owner = await import("../../src/services/canvas-image-loader");
        const media = await import("../../src/services/canvas-media-source");
        const assert = (value: unknown, message: string) => {
            if (!value) throw new Error(message);
        };
        const flush = async () => {
            for (let i = 0; i < 10; i++) await Promise.resolve();
        };
        const finish = async (image: TestImage) => {
            image.onload?.();
            image.decoded.resolve();
            await flush();
        };
        const controller = () => new AbortController();
        const source = (src: string, id?: string, expiry = Infinity) => owner.registerCanvasImageSource(src, id, "original", expiry);
        if (scenario === "expired-registry") {
            const expired = source("/expired", "resource", now + 1);
            now += 2;
            for (let i = 0; i < 257; i++) source(`/other-${i}`);
            owner.peekCanvasImage("/other");
            const result = await owner.prepareCanvasImage(expired, controller().signal).then(
                () => "loaded",
                () => "rejected",
            );
            assert(result === "rejected" && !images.length, "evicted capability regained unlimited access");
        } else if (scenario === "expires-during-decode") {
            const result = owner.prepareCanvasImage(source("/expires", "resource", now + 1), controller().signal).then(
                () => "loaded",
                () => "rejected",
            );
            now += 2;
            await finish(images[0]);
            assert((await result) === "rejected" && !owner.peekCanvasImage("/expires"), "expired result was published to a new DOM consumer");
        } else if (scenario === "dispose-url-generations" || scenario === "scope-late") {
            const results = [owner.prepareCanvasImage(source("/old", "same"), controller().signal).catch((error) => error.name), owner.prepareCanvasImage(source("/new", "same"), controller().signal).catch((error) => error.name)];
            const late = images[0];
            late.onload?.();
            if (scenario === "scope-late") scope = "account-b";
            owner.disposeCanvasImageSession();
            late.decoded.resolve();
            assert(
                (await Promise.all(results)).every((value) => value === "AbortError"),
                "dispose did not reject all URL generations",
            );
            const stats = owner.canvasImagePreparationStats();
            assert(!stats.active && !stats.queued && !stats.warmPixels && !stats.presentations, "dispose left physical work or account state");
            assert(!owner.peekCanvasImage("/old"), "late old-scope result became reusable");
        } else if (scenario === "shared-cancel") {
            const descriptor = source("/shared", "shared"),
                a = controller(),
                b = controller();
            const first = owner.prepareCanvasImage(descriptor, a.signal).catch((error) => error.name);
            const second = owner.prepareCanvasImage(descriptor, b.signal);
            a.abort();
            await flush();
            assert((await first) === "AbortError" && images.length === 1 && owner.canvasImagePreparationStats().active === 1, "one consumer cancelled another");
            await finish(images[0]);
            assert((await second) === images[0], "shared survivor did not receive prepared pixels");
            const final = controller();
            const pending = owner.prepareCanvasImage(source("/last"), final.signal).catch((error) => error.name);
            final.abort();
            await flush();
            assert((await pending) === "AbortError" && !owner.canvasImagePreparationStats().active, "last consumer did not release slot");
        } else if (scenario === "priority-promotion") {
            const controls = Array.from({ length: 7 }, controller);
            const results = Array.from({ length: 4 }, (_, i) => owner.prepareCanvasImage(source(`/active-${i}`), controls[i].signal, undefined, 2).catch(() => null));
            const low = source("/low"),
                promoted = source("/promoted");
            results.push(owner.prepareCanvasImage(low, controls[4].signal, undefined, 2).catch(() => null));
            results.push(owner.prepareCanvasImage(promoted, controls[5].signal, undefined, 2).catch(() => null));
            results.push(owner.prepareCanvasImage(promoted, controls[6].signal, undefined, 0).catch(() => null));
            controls[5].abort();
            await flush();
            await finish(images[0]);
            assert(images[4].src === "/promoted" && owner.canvasImagePreparationStats().active <= 4, "visible promotion lost priority or shared consumer");
            controls.forEach((item) => item.abort());
            await Promise.all(results);
            await flush();
            assert(!owner.canvasImagePreparationStats().active && !owner.canvasImagePreparationStats().queued, "cancelled priority queue did not drain");
        } else if (scenario === "priority-downgrade") {
            const controls = Array.from({ length: 7 }, controller);
            const results = Array.from({ length: 4 }, (_, i) => owner.prepareCanvasImage(source(`/active-${i}`), controls[i].signal).catch(() => null));
            const background = owner.registerCanvasImageSource("/background", "background", "original", Infinity, { originalWidth: 10, originalHeight: 10 });
            results.push(owner.prepareCanvasImage(background, controls[4].signal, undefined, 1).catch(() => null));
            results.push(owner.prepareCanvasImage(background, controls[5].signal, undefined, 0).catch(() => null));
            results.push(owner.prepareCanvasImage(source("/foreground"), controls[6].signal, undefined, 0).catch(() => null));
            controls[5].abort();
            await flush();
            await finish(images[0]);
            assert(images[4].src === "/foreground", "cancelled visible consumer left overscan at foreground priority");
            controls.forEach((item) => item.abort());
            await Promise.all(results);
        } else if (scenario === "priority-cost-aging") {
            const controls = Array.from({ length: 7 }, controller);
            const results = Array.from({ length: 4 }, (_, i) => owner.prepareCanvasImage(source(`/active-${i}`), controls[i].signal).catch(() => null));
            const large = owner.registerCanvasImageSource("/large", "large", "original", Infinity, { originalWidth: 4000, originalHeight: 3000 });
            const small = owner.registerCanvasImageSource("/small", "small", "original", Infinity, { originalWidth: 600, originalHeight: 400 });
            results.push(owner.prepareCanvasImage(large, controls[4].signal).catch(() => null));
            results.push(owner.prepareCanvasImage(small, controls[5].signal).catch(() => null));
            await finish(images[0]);
            assert(images[4].src === "/small", "large FIFO image blocks cheap same-priority media");
            now += 1001;
            const tiny = owner.registerCanvasImageSource("/tiny", "tiny", "original", Infinity, { originalWidth: 10, originalHeight: 10 });
            results.push(owner.prepareCanvasImage(tiny, controls[6].signal).catch(() => null));
            await finish(images[1]);
            assert(images[5].src === "/large", "small-image throughput starved aged visible work");
            controls.forEach((item) => item.abort());
            await Promise.all(results);
        } else if (scenario === "same-url-resource") {
            const a = source("/same-url", "A");
            const first = owner.prepareCanvasImage(a, controller().signal);
            await finish(images[0]);
            await first;
            const b = source("/same-url", "B");
            const second = owner.prepareCanvasImage(b, controller().signal);
            await finish(images[1]);
            await second;
            assert((await owner.prepareCanvasImage(a, controller().signal)) === images[0], "URL-index alias replaced the requested resource's prepared handle");
        } else if (scenario === "old-handle-release") {
            const first = owner.prepareCanvasImage(source("/old", "same"), controller().signal);
            await finish(images[0]);
            await first;
            const release = owner.retainCanvasImage("/old");
            const second = owner.prepareCanvasImage(source("/new", "same"), controller().signal);
            await finish(images[1]);
            await second;
            release();
            assert(owner.peekCanvasImage("/new") === images[1] && !owner.peekCanvasImage("/old"), "old release overwrote new handle");
        } else if (scenario === "warm-budget") {
            auto = true;
            for (let i = 0; i < 55; i++) await owner.prepareCanvasImage(source(`/budget-${i}`), controller().signal);
            const stats = owner.canvasImagePreparationStats();
            assert(stats.warmPixels <= 16000000 && stats.warmImages <= 48 && !owner.peekCanvasImage("/budget-0"), "warm pixel/item budget failed to evict");
            assert(Boolean(owner.peekCanvasImage("/budget-54")), "LRU evicted newest pixels");
        } else {
            auto = true;
            const prepare = (storageKey: string, src: string, extra: object = {}) => media.prepareCanvasMedia({ storageKey, src, variant: "original", signal: controller().signal, ...extra });
            if (scenario === "resource-identity") {
                source("/resource-A", "A");
                const result = await prepare("resource:B", "/resource-A");
                assert(result.source.src === "/resource-B" && calls === 1, "URL fast path crossed authoritative resource identity");
            } else if (scenario === "expired-fallback") {
                source("/expired-credential", "A", now - 1);
                for (let i = 0; i < 257; i++) source(`/churn-${i}`);
                access = async () => {
                    throw new Error("403 forbidden");
                };
                const result = await prepare("resource:A", "/expired-credential").then(
                    () => "loaded",
                    () => "rejected",
                );
                assert(result === "rejected" && !images.length && calls === 2, "raw fallback bypassed expired/forbidden capability");
            } else if (scenario === "actual-variant-metadata") {
                owner.registerCanvasImageSource("/actual-original", "A", "original", Infinity, { requestedVariant: "thumbnail", originalWidth: 4000, originalHeight: 3000 });
                const result = await prepare("resource:A", "/actual-original", { variant: "thumbnail" });
                assert(result.actualVariant === "original" && result.width === 4000 && result.height === 3000 && calls === 0, "fast path lost actual variant or intrinsic dimensions");
            } else if (scenario === "fallback-success") {
                access = async () => {
                    throw new Error("unavailable");
                };
                const result = await prepare("resource:A", "/untrusted", { fallbackSource: source("/independent-external") });
                assert(result.source.src === "/independent-external" && images[0].src === result.source.src, "published failed candidate instead of prepared fallback");
            } else if (scenario === "forbidden") {
                access = async () => {
                    throw new Error("403 forbidden");
                };
                await prepare("resource:A", "").then(
                    () => {
                        throw Error("forbidden access succeeded");
                    },
                    () => {},
                );
                assert(calls === 2 && !images.length, "access failure retried without bound or started a raw load");
            } else if (scenario === "access-cancel") {
                access = async () => {
                    throw new DOMException("session generation changed", "AbortError");
                };
                const result = await prepare("resource:A", "", { variant: "thumbnail", thumbnailFallback: "original", fallbackSource: source("/external") }).then(
                    () => "loaded",
                    (error) => error.name,
                );
                assert(result === "AbortError" && calls === 1 && !images.length, "access AbortError was retried or downgraded to fallback");
            } else if (scenario === "renewal") {
                source("/expired-A", "A", now - 1);
                const result = await prepare("resource:A", "/expired-A");
                assert(result.source.resourceId === "A" && result.source.src === "/resource-A" && images.length === 1, "renewal changed media identity or reused expired URL");
            }
        }
        owner.disposeCanvasImageSession();
        self.postMessage({ scenario, passed: true });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.stack : String(error) });
    } finally {
        Date.now = realNow;
        mock.restore();
    }
};
