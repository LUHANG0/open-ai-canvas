import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
let intersect: (entries: Array<{ isIntersecting: boolean }>) => void;
let reduced = false;
const mediaListeners = new Set<() => void>();
const timers = new Map<number, () => void>();
let timerID = 0;
Object.defineProperty(dom, "matchMedia", { value: () => ({ get matches() { return reduced; }, addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn), removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn) }) });
Object.defineProperty(dom, "setTimeout", { value: (fn: () => void) => { timers.set(++timerID, fn); return timerID; } });
Object.defineProperty(dom, "clearTimeout", { value: (id: number) => timers.delete(id) });
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true, IntersectionObserver: class { constructor(callback: typeof intersect) { intersect = callback; } observe() {} disconnect() {} } })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// DOM globals must exist before React DOM and the media component initialize.
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: Showcase } = await import("../src/components/brand/brand-auth-showcase");
afterAll(() => { dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
async function fixture() {
    reduced = false; timers.clear();
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<Showcase open />));
    return {
        host,
        visible: async (value: boolean) => { await act(async () => intersect([{ isIntersecting: value }])); },
        load: async () => { await act(async () => host.querySelector("img")!.dispatchEvent(new dom.Event("load"))); },
        tick: async () => { const pending = [...timers.values()]; timers.clear(); await act(async () => pending.forEach((fn) => fn())); },
        click: async (selector: string) => { await act(async () => host.querySelector<HTMLButtonElement>(selector)!.click()); },
        close: async () => { await act(async () => root.unmount()); host.remove(); },
    };
}

test("only visible current artwork loads; manual navigation pauses and playback resumes", async () => {
    const f = await fixture();
    try {
        expect(f.host.querySelector("img")).toBeNull();
        await f.visible(true);
        const first = f.host.querySelector("img")!.src;
        expect(new URL(first).hostname).toBe("image01-aliyun.vidu.zone");
        expect(f.host.querySelector("img")!.getAttribute("fetchpriority")).toBe("high");
        expect(f.host.querySelectorAll("img")).toHaveLength(1);
        await f.load(); await f.tick();
        const second = f.host.querySelector("img")!.src;
        expect(second).not.toBe(first);
        await f.load(); await f.click(".mc-auth-showcase-toggle"); await f.tick();
        expect(f.host.querySelector("img")!.src).toBe(second);
        await f.click(".mc-auth-showcase-dots button:nth-child(3)"); await f.load(); await f.tick();
        const third = f.host.querySelector("img")!.src;
        expect(third).not.toBe(first); expect(third).not.toBe(second);
        await f.click(".mc-auth-showcase-toggle"); await f.tick();
        expect(f.host.querySelector("img")!.src).toBe(first);
    } finally { await f.close(); }
});

test("offscreen, background, focus and reduced motion suspend automatic changes", async () => {
    const f = await fixture();
    try {
        await f.visible(true); await f.load(); const first = f.host.querySelector("img")!.src;
        await f.visible(false); await f.tick(); expect(f.host.querySelector("img")!.src).toBe(first);
        await f.visible(true);
        await act(async () => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new dom.Event("visibilitychange")); });
        await f.tick(); expect(f.host.querySelector("img")!.src).toBe(first);
        await act(async () => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new dom.Event("visibilitychange")); f.host.querySelector<HTMLButtonElement>("button")!.focus(); });
        await f.tick(); expect(f.host.querySelector("img")!.src).toBe(first);
        await act(async () => { (document.activeElement as HTMLElement).blur(); reduced = true; mediaListeners.forEach((fn) => fn()); });
        await f.tick(); expect(f.host.querySelector("img")!.src).toBe(first);
        await f.click(".mc-auth-showcase-dots button:nth-child(2)");
        expect(f.host.querySelector("img")!.src).not.toBe(first);
    } finally { await f.close(); }
});

test("failed artwork is skipped once and all failures leave a finite nonblocking fallback", async () => {
    const f = await fixture();
    try {
        await f.visible(true); const attempted = new Set<string>();
        for (let n = 0; n < 3; n++) {
            const image = f.host.querySelector("img")!;
            expect(attempted.has(image.src)).toBe(false); attempted.add(image.src);
            await act(async () => image.dispatchEvent(new dom.Event("error")));
        }
        await f.tick();
        expect(f.host.querySelector("img")).toBeNull();
        expect(f.host.querySelector('[role="status"]')?.textContent).toContain("不影响登录");
        for (const button of f.host.querySelectorAll<HTMLButtonElement>("button")) expect(button.disabled).toBe(true);
    } finally { await f.close(); }
});
