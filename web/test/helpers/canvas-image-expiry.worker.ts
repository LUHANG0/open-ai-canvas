import { mock } from "bun:test";

self.onmessage = async ({ data: scenario }) => {
    const originalNow = Date.now, originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
    const originalValues = Map.prototype.values;
    let now = 1_000_000, scope = "account-a", sequence = 0, scheduled = 0, cancelled = 0, scans = 0;
    const timers = new Map<number, { at: number; callback: () => void }>();
    const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
    const fire = (id: number) => {
        const timer = timers.get(id)!;
        timers.delete(id);
        timer.callback();
    };
    const advance = (time: number) => {
        now = time;
        for (;;) {
            const due = [...timers].find(([, timer]) => timer.at <= now);
            if (!due) break;
            fire(due[0]);
        }
    };
    class TestImage {
        naturalWidth = 100;
        naturalHeight = 100;
        complete = false;
        decoding = "";
        onload: (() => void) | null = null;
        onerror = null;
        set src(_: string) { queueMicrotask(() => this.onload?.()); }
        decode() { return Promise.resolve(); }
        removeAttribute() {}
    }
    try {
        Date.now = () => now;
        globalThis.setTimeout = ((callback: () => void, delay = 0) => {
            const id = ++sequence;
            timers.set(id, { at: now + delay, callback });
            scheduled++;
            return id;
        }) as unknown as typeof setTimeout;
        globalThis.clearTimeout = ((id: number) => { if (timers.delete(id)) cancelled++; }) as unknown as typeof clearTimeout;
        Object.defineProperty(globalThis, "Image", { configurable: true, value: TestImage });
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => scope }));
        // Load after fake timers and scope mocks so module initialization uses this isolated platform.
        const owner = await import("../../src/services/canvas-image-loader");
        const prepare = async (src: string, validUntil = Infinity) => {
            const source = owner.registerCanvasImageSource(src, undefined, "original", validUntil);
            return owner.prepareCanvasImage(source, new AbortController().signal);
        };
        if (scenario === "shared-consumers") {
            for (let i = 0; i < 18; i++) await prepare(`/shared-${i}`, now + 120_000);
            for (let i = 0; i < 256; i++) owner.rememberImagePresentation(`node-${i}`, `/shared-${i % 18}`);
            const before = { scheduled, cancelled };
            Map.prototype.values = function () { scans++; return originalValues.call(this); };
            const releases: (() => void)[] = [];
            for (let i = 0; i < 1000; i++) {
                releases.push(owner.retainCanvasImage(`/shared-${i % 18}`));
                owner.rememberImagePresentation(`node-${i % 256}`, `/shared-${i % 18}`);
            }
            Map.prototype.values = originalValues;
            assert(scheduled === before.scheduled && cancelled === before.cancelled && scans === 0,
                `shared consumers rebuilt expiry scheduling: set=${scheduled - before.scheduled}, clear=${cancelled - before.cancelled}, scans=${scans}`);
            assert(owner.canvasImagePreparationStats().activeImages === 18, "shared active images lost retention");
            releases.forEach((release) => release());
            advance(now + 60_000);
            assert(owner.canvasImagePreparationStats().warmImages === 0, "shared warm pixels leaked");
            assert(owner.canvasImagePreparationStats().presentations === 256, "warm cleanup removed valid presentations");
            advance(now + 60_000);
            const stats = owner.canvasImagePreparationStats();
            assert(stats.presentations === 0 && stats.sources === 0 && timers.size === 0, "metadata expiry leaked");
        } else if (scenario === "earlier-expiry") {
            await prepare("/later", now + 120_000);
            owner.rememberImagePresentation("later", "/later");
            await prepare("/earlier", now + 1000);
            owner.rememberImagePresentation("earlier", "/earlier");
            advance(now + 1000);
            assert(!owner.canvasImageSourceFor("/earlier") && !owner.getImagePresentation("earlier"), "earlier capability survived expiry");
            assert(owner.getImagePresentation("later") === "/later", "earlier collection removed later metadata");
            advance(now + 59_000);
            assert(owner.canvasImagePreparationStats().warmImages === 0, "later warm expiry not rescheduled");
            advance(now + 60_000);
            assert(owner.canvasImagePreparationStats().sources === 0 && timers.size === 0, "later metadata expiry not rescheduled");
        } else if (scenario === "last-release") {
            const image = await prepare("/visible");
            const first = owner.retainCanvasImage("/visible"), last = owner.retainCanvasImage("/visible");
            advance(now + 180_000);
            assert(owner.peekCanvasImage("/visible") === image, "active image expired");
            first();
            advance(now + 60_000);
            assert(owner.peekCanvasImage("/visible") === image, "non-final release expired active image");
            last(); last();
            advance(now + 59_999);
            assert(owner.peekCanvasImage("/visible") === image, "last release did not start fresh TTL");
            advance(now + 1);
            assert(!owner.peekCanvasImage("/visible") && timers.size === 0, "last release warm TTL leaked");
        } else if (scenario === "sync-collection") {
            await prepare("/expired", now + 1000);
            owner.rememberImagePresentation("expired", "/expired");
            await prepare("/survivor", now + 120_000);
            now += 1000; // Simulate a delayed event loop: synchronous read wins over the timer.
            assert(!owner.peekCanvasImage("/expired"), "synchronous expiry exposed expired pixels");
            assert(timers.size === 1, "synchronous collection left duplicate timers");
            advance(now + 59_000);
            assert(owner.canvasImagePreparationStats().warmImages === 0 && timers.size === 1, "warm cleanup lost metadata timer");
            advance(now + 60_000);
            assert(timers.size === 0 && owner.canvasImagePreparationStats().sources === 0, "synchronous collection lost final expiry");
        } else if (scenario === "early-wakeup") {
            await prepare("/clock");
            const timer = [...timers][0];
            fire(timer[0]); // Wall clock moved back / callback ran before its absolute deadline.
            assert(timers.size === 1 && owner.peekCanvasImage("/clock"), "early callback lost expiry scheduling");
            advance(now + 60_000);
            assert(!owner.peekCanvasImage("/clock") && timers.size === 0, "early callback leaked warm cache");
        } else if (scenario === "long-deadline") {
            const maxDelay = 2_147_483_647;
            const deadline = now + maxDelay + 5000;
            owner.registerCanvasImageSource("/long-lived", undefined, "original", deadline);
            assert([...timers.values()].every((timer) => timer.at - now <= maxDelay), "long capability overflowed the native timer range");
            advance(now + maxDelay);
            assert(Boolean(owner.canvasImageSourceFor("/long-lived")) && timers.size === 1, "bounded wakeup expired the source before its absolute deadline");
            now -= maxDelay * 2;
            fire([...timers.keys()][0]);
            assert([...timers.values()].every((timer) => timer.at - now <= maxDelay), "backwards clock overflowed the native timer range");
            advance(deadline);
            assert(!owner.canvasImageSourceFor("/long-lived") && timers.size === 0, "absolute expiry failed after bounded wakeups");
        } else if (scenario === "scope-release") {
            await prepare("/old");
            const release = owner.retainCanvasImage("/old");
            owner.disposeCanvasImageSession();
            assert(timers.size === 0, "scope disposal left expiry timer");
            scope = "account-b";
            const image = await prepare("/new");
            const before = scheduled;
            release();
            assert(scheduled === before && owner.peekCanvasImage("/new") === image, "old release changed new scope");
            advance(now + 60_000);
            assert(!owner.peekCanvasImage("/new") && timers.size === 0, "new scope warm expiry leaked");
        }
        owner.disposeCanvasImageSession();
        self.postMessage({ scenario, passed: true });
    } catch (error) {
        self.postMessage({ error: String(error) });
    } finally {
        Map.prototype.values = originalValues;
        Date.now = originalNow;
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        mock.restore();
    }
};
