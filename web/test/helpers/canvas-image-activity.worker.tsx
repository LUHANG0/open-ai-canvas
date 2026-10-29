import { Window } from "happy-dom";

self.onmessage = async () => {
    const dom = new Window({ url: "http://localhost/" });
    let root: import("react-dom/client").Root | undefined;
    try {
        const images: PendingImage[] = [];
        class PendingImage {
            src = ""; decoding = ""; naturalWidth = 1200; naturalHeight = 800; complete = false;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            decoded = Promise.withResolvers<void>();
            constructor() { images.push(this); }
            decode() { return this.decoded.promise; }
            removeAttribute() { this.src = ""; }
        }
        const observers = new Map<Element, { callback: (entries: { isIntersecting: boolean }[]) => void }>();
        class VisibilityObserver {
            target?: Element;
            constructor(readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
            observe(target: Element) { this.target = target; observers.set(target, this); this.callback([{ isIntersecting: true }]); }
            disconnect() { if (this.target) observers.delete(this.target); }
        }
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Image: PendingImage, IntersectionObserver: VisibilityObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        }
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { RetainedCanvasImage } = await import("../../src/components/canvas/canvas-retained-image");
        const loader = await import("../../src/services/canvas-image-loader");
        const { setActiveUserScope } = await import("../../src/lib/user-scope");
        const { canvasThemes } = await import("../../src/lib/canvas-theme");
        const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
        const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
        const animated = () => host.querySelectorAll('.canvas-original-image-feedback[data-active="true"]').length;
        const busy = () => host.querySelectorAll('[aria-busy="true"]').length;
        const fitted: string[] = [];
        const render = async (scope: string) => {
            setActiveUserScope(scope);
            await act(async () => root!.render(<>{Array.from({ length: 8 }, (_, i) => <section key={i} data-fixture={i}>
                <RetainedCanvasImage identity={`${scope}:${i}`} src={`/image-${scope}-${i}.png`} originalSize={{}} fitToImage={() => fitted.push(scope)} className="fixture" loading={false} theme={canvasThemes.dark} />
            </section>)}</>));
        };
        await render("account-a");
        const initial = { busy: busy(), animated: animated(), active: loader.canvasImagePreparationStats().active, queued: loader.canvasImagePreparationStats().queued };
        assert(initial.busy === 8 && initial.active === 4 && initial.queued === 4, `incorrect loading fixture: ${JSON.stringify(initial)}`);
        assert(initial.animated === 4, `queued images also animate: ${JSON.stringify(initial)}`);
        await act(async () => { images[0].onload!(); });
        assert(animated() === 4 && fitted.length === 0, "animation stopped before decoding finished");
        await act(async () => images[0].decoded.resolve());
        assert(fitted.length === 1 && animated() === 4 && loader.canvasImagePreparationStats().queued === 3, "decode did not hand its slot to the next image");
        await act(async () => images[1].onerror!());
        assert(host.textContent?.includes("原图加载失败") && animated() === 4, "failure did not keep retry feedback and release the animation slot");
        await act(async () => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new dom.Event("visibilitychange")); });
        assert(animated() === 0 && busy() === 6, "hidden tab still animates or lost busy semantics");
        await act(async () => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new dom.Event("visibilitychange")); });
        assert(animated() === 4, "visible tab did not resume active image feedback");
        const target = host.querySelector('.canvas-original-image-feedback[data-active="true"]')!;
        await act(async () => observers.get(target)!.callback([{ isIntersecting: false }]));
        assert(animated() === 3, "offscreen image still animates");
        await act(async () => observers.get(target)!.callback([{ isIntersecting: true }]));
        assert(animated() === 4, "reentering image did not resume");
        const late = images[2];
        await act(async () => late.onload!());
        await render("account-b");
        await act(async () => late.decoded.resolve());
        assert(fitted.join() === "account-a" && !host.querySelector('img[src*="account-a"]'), "late decode crossed accounts");
        await act(async () => root!.unmount()); root = undefined;
        await Promise.resolve();
        assert(loader.canvasImagePreparationStats().active === 0 && loader.canvasImagePreparationStats().queued === 0 && observers.size === 0, "unmount did not drain jobs and visibility observers");

        setActiveUserScope("shared-account");
        let notifications = 0, unrelated = 0;
        const unsubscribe = loader.subscribeCanvasImageActivity("/shared.png", () => { notifications++; });
        const unrelatedUnsubscribe = loader.subscribeCanvasImageActivity("/other.png", () => { unrelated++; });
        const first = new AbortController(), second = new AbortController();
        const firstResult = loader.prepareCanvasImage("/shared.png", first.signal).catch((error) => error.name);
        const sharedImage = images.at(-1)!;
        const secondResult = loader.prepareCanvasImage("/shared.png", second.signal).catch((error) => error.name);
        assert(loader.isCanvasImageActive("/shared.png") && notifications === 1 && unrelated === 0, "activity notified unrelated sources or missed sharing");
        first.abort(); await Promise.resolve();
        assert(await firstResult === "AbortError" && loader.isCanvasImageActive("/shared.png"), "one consumer cancelled the other's job");
        sharedImage.onload!(); sharedImage.decoded.resolve(); await secondResult;
        assert(!loader.isCanvasImageActive("/shared.png") && notifications === 2 && unrelated === 0, "shared decode never settled activity");
        const count = images.length;
        await loader.prepareCanvasImage("/shared.png", new AbortController().signal);
        assert(images.length === count && notifications === 2, "cache hit incorrectly restarted loading activity");
        unsubscribe(); unrelatedUnsubscribe();
        const timeout = await loader.prepareCanvasImage("/timeout.png", new AbortController().signal, 5).then(() => false, () => true);
        assert(timeout && !loader.isCanvasImageActive("/timeout.png") && loader.canvasImagePreparationStats().active === 0, "timeout left stale activity");
        self.postMessage({ initial, decoded: true, failed: true, hidden: true, offscreen: true, isolated: true, shared: true, cached: true, timeout: true, drained: true });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.stack : String(error) });
    } finally {
        dom.happyDOM.abort();
    }
};
