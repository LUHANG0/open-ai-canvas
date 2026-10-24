import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
class VisibleObserver {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() {}
}
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IntersectionObserver: VisibleObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BrandFilmStage } = await import("../src/components/brand/brand-film-stage");
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(options: { reduced?: boolean; preview?: boolean } = {}) {
    const frames = new Map<number, FrameRequestCallback>();
    const timers = new Map<number, { callback: () => void; delay: number }>();
    let id = 0;
    const previous = { request: dom.requestAnimationFrame, cancel: dom.cancelAnimationFrame, set: dom.setTimeout, clear: dom.clearTimeout, media: dom.matchMedia };
    dom.requestAnimationFrame = ((callback: FrameRequestCallback) => { frames.set(++id, callback); return id; }) as typeof dom.requestAnimationFrame;
    dom.cancelAnimationFrame = ((value: number) => { frames.delete(value); }) as typeof dom.cancelAnimationFrame;
    dom.setTimeout = ((callback: () => void, delay: number) => { timers.set(++id, { callback, delay }); return id; }) as typeof dom.setTimeout;
    dom.clearTimeout = ((value: number) => { timers.delete(value); }) as typeof dom.clearTimeout;
    dom.matchMedia = (() => ({ matches: Boolean(options.reduced), addEventListener() {}, removeEventListener() {} })) as typeof dom.matchMedia;
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<BrandFilmStage preview={options.preview} />));
    return {
        host, frames,
        active: () => [...host.querySelectorAll(".mc-film-thumb")].findIndex((button) => button.getAttribute("aria-pressed") === "true"),
        progress: () => host.querySelector<HTMLElement>(".mc-film-progress i")!.style.transform,
        tick: async (time: number) => act(async () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(time)); }),
        resume: async () => act(async () => { for (const [key, timer] of [...timers]) if (timer.delay === 1200) { timers.delete(key); timer.callback(); } }),
        click: async (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click()),
        close: async () => {
            await act(async () => root.unmount()); host.remove();
            dom.requestAnimationFrame = previous.request; dom.cancelAnimationFrame = previous.cancel;
            dom.setTimeout = previous.set; dom.clearTimeout = previous.clear; dom.matchMedia = previous.media;
        },
    };
}

test("hover pauses elapsed progress and leaving resumes the remaining interval", async () => {
    const f = await fixture();
    try {
        await f.tick(0); await f.tick(4000);
        expect(f.active()).toBe(0);
        expect(f.progress()).toBe("scaleX(0.5)");
        const rail = f.host.querySelector(".mc-film-rail")!;
        await act(async () => rail.dispatchEvent(new dom.PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
        expect(f.frames.size).toBe(0);
        await f.tick(10000);
        expect(f.progress()).toBe("scaleX(0.5)");
        await act(async () => rail.dispatchEvent(new dom.PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body })));
        expect(f.frames.size).toBe(0);
        await f.resume(); await f.tick(10000); await f.tick(14000);
        expect(f.active()).toBe(1);
        await f.tick(15000); await f.tick(24500);
        expect(f.active()).toBe(1);
        await f.tick(25000);
        expect(f.active()).toBe(2);
    } finally { await f.close(); }
});

test("manual selection starts a full interval and explicit pause survives temporary resumes", async () => {
    const f = await fixture();
    try {
        await f.tick(0); await f.tick(3000);
        await f.click('.mc-film-thumb:nth-child(6)');
        expect(f.active()).toBe(5);
        await f.tick(10000); await f.tick(17999);
        expect(f.active()).toBe(5);
        await f.tick(18000);
        expect(f.active()).toBe(6);
        await f.click(".mc-film-playback");
        expect(f.frames.size).toBe(0);
        await f.resume(); await f.tick(50000);
        expect(f.active()).toBe(6);
        expect(f.host.querySelector(".mc-film-playback")?.getAttribute("aria-label")).toBe("播放首屏影像");
        await f.click(".mc-film-playback");
        expect(f.frames.size).toBe(1);
    } finally { await f.close(); }
});

test("releasing outside the rail after a vertical exit resumes playback", async () => {
    const f = await fixture();
    try {
        await f.tick(0); await f.tick(2000);
        const rail = f.host.querySelector(".mc-film-rail")!;
        await act(async () => rail.dispatchEvent(new dom.PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: 40, clientY: 40 })));
        expect(f.frames.size).toBe(0);
        await act(async () => rail.dispatchEvent(new dom.PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body })));
        await act(async () => document.body.dispatchEvent(new dom.PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 40, clientY: 150 })));
        rail.scrollLeft = 20;
        await act(async () => rail.dispatchEvent(new dom.PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 140, clientY: 40 })));
        expect(rail.scrollLeft).toBe(20);
        await f.resume();
        expect(f.frames.size).toBe(1);
        await f.tick(20000); await f.tick(26000);
        expect(f.active()).toBe(1);
    } finally { await f.close(); }
});

test("hidden pages, reduced motion and preview do not autoplay", async () => {
    const f = await fixture();
    const descriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    try {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        await act(async () => document.dispatchEvent(new dom.Event("visibilitychange")));
        expect(f.frames.size).toBe(0);
    } finally {
        if (descriptor) Object.defineProperty(document, "visibilityState", descriptor);
        else Reflect.deleteProperty(document, "visibilityState");
        await f.close();
    }
    const reduced = await fixture({ reduced: true });
    try {
        expect(reduced.frames.size).toBe(0);
        await reduced.click(".mc-film-playback");
        expect(reduced.frames.size).toBe(1);
    } finally { await reduced.close(); }
    const preview = await fixture({ preview: true });
    try {
        expect(preview.frames.size).toBe(0);
        expect(preview.host.querySelector(".mc-film-playback")).toBeNull();
        expect(preview.host.querySelectorAll("video[src]")).toHaveLength(0);
    } finally { await preview.close(); }
});
