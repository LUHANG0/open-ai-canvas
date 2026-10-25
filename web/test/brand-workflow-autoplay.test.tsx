import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
let emitVisibility: (visible: boolean) => void;
for (const [name, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true, IntersectionObserver: class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { emitVisibility = (isIntersecting) => callback([{ isIntersecting }]); }
    observe() { emitVisibility(true); } disconnect() {}
} })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BrandWorkflowTheater, WORKFLOW_AUTOPLAY_MS } = await import("../src/components/brand/brand-workflow-theater");
afterAll(() => {
    dom.happyDOM.abort();
    for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
});

async function fixture({ preview = false, reduced = false } = {}) {
    const previous = { set: dom.setTimeout, clear: dom.clearTimeout, media: dom.matchMedia, hidden: Object.getOwnPropertyDescriptor(document, "hidden") };
    const timers = new Map<number, () => void>(); let id = 0;
    dom.setTimeout = ((callback: () => void, delay: number) => { if (delay !== WORKFLOW_AUTOPLAY_MS) throw new Error("Unexpected timer"); timers.set(++id, callback); return id; }) as typeof dom.setTimeout;
    dom.clearTimeout = ((value: number) => timers.delete(value)) as typeof dom.clearTimeout;
    dom.matchMedia = (() => ({ matches: reduced, addEventListener() {}, removeEventListener() {} })) as typeof dom.matchMedia;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<BrandWorkflowTheater preview={preview} creationLink="/canvas" />));
    const theater = host.querySelector<HTMLElement>(".mc-workflow-theater")!;
    return {
        host, theater, timers,
        selected: () => [...host.querySelectorAll(".mc-theater-categories button")].findIndex((button) => button.getAttribute("aria-pressed") === "true"),
        tick: async () => act(async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((run) => run()); }),
        select: async (index: number) => act(async () => host.querySelectorAll<HTMLButtonElement>(".mc-theater-categories button")[index].click()),
        pointer: async (type: string, pointerType = "mouse") => act(async () => theater.dispatchEvent(new dom.PointerEvent(type, { bubbles: true, pointerType, relatedTarget: document.body }))),
        page: async (hidden: boolean) => act(async () => { Object.defineProperty(document, "hidden", { configurable: true, value: hidden }); document.dispatchEvent(new dom.Event("visibilitychange")); }),
        close: async () => {
            await act(async () => root.unmount()); host.remove();
            expect(timers.size).toBe(0);
            dom.setTimeout = previous.set; dom.clearTimeout = previous.clear; dom.matchMedia = previous.media;
            if (previous.hidden) Object.defineProperty(document, "hidden", previous.hidden); else Reflect.deleteProperty(document, "hidden");
        },
    };
}

test("cycles through all eight directions and wraps, without moving focus", async () => {
    const f = await fixture();
    try {
        const focus = document.activeElement;
        expect(f.timers.size).toBe(1);
        for (let next = 1; next <= 8; next++) { await f.tick(); expect(f.selected()).toBe(next % 8); expect(f.timers.size).toBe(1); }
        expect(document.activeElement).toBe(focus);
        expect(f.host.querySelector(".mc-theater-category-progress")).not.toBeNull();
    } finally { await f.close(); }
});

test("manual selection restarts the interval even when selecting the current direction", async () => {
    const f = await fixture();
    try {
        const first = [...f.timers.keys()][0]; await f.select(0);
        expect([...f.timers.keys()][0]).not.toBe(first);
        await f.select(7); await f.tick(); expect(f.selected()).toBe(0);
    } finally { await f.close(); }
});

test("hover and touch interaction suspend switching and release resumes; explicit pause persists", async () => {
    const f = await fixture();
    try {
        await f.pointer("pointerover"); expect(f.timers.size).toBe(0); await f.tick(); expect(f.selected()).toBe(0);
        await f.pointer("pointerout"); expect(f.timers.size).toBe(1);
        await f.pointer("pointerdown", "touch"); expect(f.timers.size).toBe(0);
        await act(async () => dom.dispatchEvent(new dom.PointerEvent("pointerup", { pointerType: "touch" }))); expect(f.timers.size).toBe(1);
        await act(async () => f.host.querySelector<HTMLButtonElement>('[aria-label="暂停自动轮播"]')!.click());
        await f.pointer("pointerover"); await f.pointer("pointerout"); await f.page(true); await f.page(false);
        expect(f.timers.size).toBe(0);
        await act(async () => f.host.querySelector<HTMLButtonElement>('[aria-label="播放自动轮播"]')!.click()); expect(f.timers.size).toBe(1);
    } finally { await f.close(); }
});

test("keyboard focus, hidden pages and offscreen sections cancel timers without catch-up jumps", async () => {
    const f = await fixture();
    try {
        const button = f.host.querySelector<HTMLButtonElement>(".mc-demo-handle")!;
        await act(async () => button.focus()); expect(f.timers.size).toBe(0);
        await act(async () => button.blur()); expect(f.timers.size).toBe(1);
        await f.page(true); expect(f.timers.size).toBe(0); await f.page(false); expect(f.timers.size).toBe(1);
        await act(async () => emitVisibility(false)); expect(f.timers.size).toBe(0);
        await act(async () => emitVisibility(true)); expect(f.timers.size).toBe(1); expect(f.selected()).toBe(0);
        await f.tick(); expect(f.selected()).toBe(1);
    } finally { await f.close(); }
});

test("preview and reduced motion never auto-switch, including after manually starting video", async () => {
    for (const options of [{ preview: true }, { reduced: true }]) {
        const f = await fixture(options);
        try {
            expect(f.timers.size).toBe(0);
            if (options.reduced) await act(async () => f.host.querySelector<HTMLButtonElement>('[aria-label="播放动态预览"]')!.click());
            await f.tick(); expect(f.selected()).toBe(0); expect(f.timers.size).toBe(0);
        } finally { await f.close(); }
    }
});
