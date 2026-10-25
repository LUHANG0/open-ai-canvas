import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Element: dom.Element, Node: dom.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, useEffect } = await import("react");
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider } = await import("react-router");
mock.module("../src/components/ui/product/app-modal/app-modal", () => ({ AppModal: ({ open, title, children, onCancel, afterClose }: any) => {
    useEffect(() => { if (!open) afterClose?.(); }, [open]);
    return open ? <section role="dialog" aria-label={typeof title === "string" ? title : undefined}><button type="button" onClick={onCancel}>关闭播放器</button>{title}{children}</section> : null;
} }));
const { BrandSite } = await import("../src/components/brand/brand-site");
const { BrandMotionMedia } = await import("../src/components/brand/brand-motion-media");
const { ReferenceFilm } = await import("../src/components/brand/brand-reference-media");
const { CinemaMedia } = await import("../src/components/brand/cinema-media");
const { BRAND_INSPIRATION_WORKS } = await import("../src/components/brand/brand-inspiration-gallery");
const { DEFAULT_BRAND_CONTENT } = await import("../src/services/api/brand-site");
type BrandContent = typeof DEFAULT_BRAND_CONTENT;

afterAll(() => {
    mock.restore();
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function mount(element: React.ReactNode) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const render = async (next: React.ReactNode) => { await act(async () => root.render(next)); };
    await render(element);
    return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
async function fixture(content = DEFAULT_BRAND_CONTENT, preview = true) {
    const f = await mount(<BrandSite content={content} preview={preview} />);
    return { ...f, render: (next: BrandContent) => f.render(<BrandSite content={next} preview={preview} />) };
}
async function key(target: Element, value: string, options: KeyboardEventInit = {}, prevented = false) {
    const event = new dom.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options });
    if (prevented) event.preventDefault();
    await act(async () => target.dispatchEvent(event));
}
async function settle() { await act(async () => { await new Promise((done) => setTimeout(done, 0)); }); }

test("reloading a previously ready shared video keeps its poster until a new frame arrives", async () => {
    const media = { image: "/poster.webp", video: "/clip.mp4" };
    const f = await mount(<BrandMotionMedia media={media} enabled={false} visible />);
    try {
        const video = f.host.querySelector("video")!;
        await act(async () => video.dispatchEvent(new dom.Event("loadeddata")));
        expect(video.hasAttribute("data-ready")).toBe(true);
        await f.render(<BrandMotionMedia media={media} enabled={false} visible={false} />);
        expect(video.hasAttribute("src")).toBe(false);
        expect(video.hasAttribute("data-ready")).toBe(false);
        await f.render(<BrandMotionMedia media={media} enabled={false} visible />);
        expect(f.host.querySelector("video") === video).toBe(true);
        expect(video.hasAttribute("data-ready")).toBe(false);
        expect(f.host.querySelector("img")?.getAttribute("src")).toBe(media.image);
        await act(async () => video.dispatchEvent(new dom.Event("loadeddata")));
        expect(video.hasAttribute("data-ready")).toBe(true);
        await act(async () => video.dispatchEvent(new dom.Event("emptied")));
        expect(video.hasAttribute("data-ready")).toBe(false);
    } finally { await f.close(); }
});

test("published sections retain saved order, custom media and visibility", async () => {
    for (const order of [["examples", "entries", "process", "faq"], ["faq", "examples", "entries", "process"], ["process", "faq", "entries", "examples"]]) {
        const sections = order.map((id) => {
            const original = DEFAULT_BRAND_CONTENT.sections.find((section) => section.id === id)!;
            return { ...original, visible: true, title: "保留" + id + "标题", items: original.items.map((item, index) => index === 0 && id === "examples" ? { ...item, title: "自有作品", media: { resourceId: "owned-gallery", kind: "image" as const, alt: "保留自有影像", posterId: "" } } : item) };
        });
        const f = await fixture({ ...DEFAULT_BRAND_CONTENT, sections });
        try {
            const actual = () => [...f.host.querySelectorAll("#mengceng-main > section[id]")].map((section) => section.id).filter((id) => order.includes(id));
            expect(actual()).toEqual(order);
            for (const section of sections) expect(f.host.querySelector("#" + section.id + " h2")?.textContent).toBe(section.title);
            const image = f.host.querySelector<HTMLImageElement>("#examples img")!;
            expect(image.getAttribute("src")).toContain("/admin/settings/brand-site/media/owned-gallery");
            expect(image.alt).toBe("保留自有影像");
            await f.render({ ...DEFAULT_BRAND_CONTENT, sections: sections.map((section) => section.id === "examples" ? { ...section, visible: false } : section) });
            expect(f.host.querySelector("#examples")).toBeNull();
            expect(actual()).toEqual(order.filter((id) => id !== "examples"));
            expect(f.host.querySelector('a[href="#examples"]')).toBeNull();
        } finally { await f.close(); }
    }
});

test("CMS supports twelve, odd and empty items without dropping custom video controls", async () => {
    const base = DEFAULT_BRAND_CONTENT.sections.find((section) => section.id === "process")!;
    const items = Array.from({ length: 12 }, (_, index) => ({ ...base.items[index % 4], title: "阶段 " + (index + 1), description: "完整说明 " + (index + 1), link: "/canvas" }));
    items[1] = { ...items[1], media: { resourceId: "owned-film", kind: "video", alt: "自定义影片", posterId: "owned-poster" } };
    const content = (count: number) => ({ ...DEFAULT_BRAND_CONTENT, sections: [{ ...base, visible: true, items: items.slice(0, count) }] });
    const f = await fixture(content(12));
    try {
        expect(f.host.querySelectorAll("#process article")).toHaveLength(12);
        const video = f.host.querySelector<HTMLVideoElement>("#process video")!;
        expect(video.getAttribute("src")).toContain("/admin/settings/brand-site/media/owned-film");
        expect(video.getAttribute("poster")).toContain("/admin/settings/brand-site/media/owned-poster");
        expect(video.controls).toBe(true);
        expect(video.autoplay).toBe(false);
        expect(f.host.textContent).toContain("完整说明 12");
        await f.render(content(3));
        expect(f.host.querySelectorAll("#process article")).toHaveLength(3);
        expect(f.host.textContent).toContain("完整说明 3");
        await f.render(content(0));
        expect(f.host.querySelectorAll("#process article")).toHaveLength(0);
        expect(video.isConnected).toBe(false);
        await f.render(content(1));
        expect(f.host.textContent).toContain("完整说明 1");
    } finally { await f.close(); }
});

test("hero scene selection keeps roving focus and ignores unrelated keyboard gestures", async () => {
    const f = await fixture(DEFAULT_BRAND_CONTENT, false);
    try {
        const buttons = [...f.host.querySelectorAll<HTMLButtonElement>(".mv-scene-switch button")];
        expect(buttons).toHaveLength(2);
        const check = (index: number) => {
            expect(buttons.findIndex((button) => button.getAttribute("aria-pressed") === "true")).toBe(index);
            expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
            expect(buttons[index].tabIndex).toBe(0);
        };
        check(0);
        const first = f.host.querySelector(".mv-hero-film img")?.getAttribute("src");
        await key(buttons[0], "End"); check(1);
        expect(document.activeElement === buttons[1]).toBe(true);
        expect(f.host.querySelector(".mv-hero-film img")?.getAttribute("src")).not.toBe(first);
        await key(buttons[1], "ArrowRight"); check(0);
        for (const options of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
            await key(buttons[0], "ArrowRight", options); check(0);
        }
        await key(buttons[0], "ArrowRight", {}, true); check(0);
        await key(buttons[0], "Tab"); check(0);
    } finally { await f.close(); }
});

test("preview prevents internal, external, anchor and prompt navigation", async () => {
    const content = { ...DEFAULT_BRAND_CONTENT, primaryLink: "https://example.com/start", sections: DEFAULT_BRAND_CONTENT.sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, link: "https://example.com/custom" })) })) };
    const f = await fixture(content);
    try {
        const links = [...f.host.querySelectorAll("a")];
        expect(links.some((link) => link.href.startsWith("https://example.com"))).toBe(true);
        expect(links.some((link) => link.getAttribute("href")?.startsWith("#"))).toBe(true);
        expect(links.some((link) => link.getAttribute("href") === "/login")).toBe(true);
        for (const link of links) {
            const event = new dom.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
            await act(async () => link.dispatchEvent(event));
            expect(event.defaultPrevented).toBe(true);
        }
        const input = f.host.querySelector<HTMLInputElement>(".mv-prompt input")!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, "不要跳转");
            input.dispatchEvent(new dom.Event("input", { bubbles: true }));
        });
        let calls = 0;
        f.host.querySelector(".mv-prompt a")!.addEventListener("click", () => calls++);
        await act(async () => f.host.querySelector("form")!.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })));
        expect(calls).toBe(0);
        expect(f.host.querySelectorAll("video[src]")).toHaveLength(0);
    } finally { await f.close(); }
});

test("hero prompt reaches authentication return state without submitting a generation", async () => {
    for (const prompt of ["", "雪夜的列车 & 光影？#一镜 <想象> 🎬"]) {
        const router = createMemoryRouter([{ path: "/", element: <BrandSite content={DEFAULT_BRAND_CONTENT} /> }, { path: "/login", element: <p>认证入口</p> }], { initialEntries: ["/"] });
        const f = await mount(<RouterProvider router={router} />);
        try {
            const input = f.host.querySelector<HTMLInputElement>(".mv-prompt input")!;
            await act(async () => {
                Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, prompt);
                input.dispatchEvent(new dom.Event("input", { bubbles: true }));
            });
            await act(async () => f.host.querySelector("form")!.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })));
            expect(router.state.location.pathname).toBe("/login");
            const next = router.state.location.state?.authReturn.next;
            if (prompt) {
                const destination = new URL(next, "https://test.invalid");
                expect(destination.pathname).toBe("/create");
                expect(destination.searchParams.get("mode")).toBe("video");
                expect(destination.searchParams.get("prompt")).toBe(prompt);
            } else expect(next).toBe(DEFAULT_BRAND_CONTENT.primaryLink);
        } finally { await f.close(); router.dispose(); }
    }
});

test("hover previews load only the pointed work, stop on leave, and stay disabled for touch and CMS preview", async () => {
    const f = await fixture(DEFAULT_BRAND_CONTENT, false);
    const point = async (element: Element, type: string, pointerType = "mouse") => act(async () => element.dispatchEvent(new dom.PointerEvent(type, { bubbles: true, pointerType })));
    try {
        const cards = [...f.host.querySelectorAll(".mv-inspiration-card")];
        await point(cards[0], "pointerover", "touch");
        expect(f.host.querySelector(".mv-inspiration-preview")).toBeNull();
        await point(cards[0], "pointerover");
        expect(f.host.querySelector(".mv-inspiration-preview")?.getAttribute("src")).toBe(BRAND_INSPIRATION_WORKS[0].video!);
        expect(f.host.querySelector<HTMLVideoElement>(".mv-inspiration-preview")?.muted).toBe(true);
        await point(cards[1], "pointerover");
        expect(f.host.querySelectorAll(".mv-inspiration-preview")).toHaveLength(1);
        expect(f.host.querySelector(".mv-inspiration-preview")?.getAttribute("src")).toBe(BRAND_INSPIRATION_WORKS[1].video!);
        await point(cards[1], "pointerout");
        expect(f.host.querySelector(".mv-inspiration-preview")).toBeNull();
        await f.render(DEFAULT_BRAND_CONTENT);
    } finally { await f.close(); }
    const preview = await fixture();
    try {
        await point(preview.host.querySelector(".mv-inspiration-card")!, "pointerover");
        expect(preview.host.querySelector(".mv-inspiration-preview")).toBeNull();
    } finally { await preview.close(); }
});

test("product navigation opens on mouse hover and retains keyboard dismissal", async () => {
    const f = await fixture();
    try {
        const menu = f.host.querySelector<HTMLDetailsElement>(".mv-product-menu")!;
        await act(async () => menu.dispatchEvent(new dom.PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
        expect(menu.open).toBe(true);
        await act(async () => menu.dispatchEvent(new dom.PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" })));
        expect(menu.open).toBe(false);
        await act(async () => menu.dispatchEvent(new dom.PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
        await key(menu, "Escape");
        expect(menu.open).toBe(false);
        expect(document.activeElement).toBe(menu.querySelector("summary"));
    } finally { await f.close(); }
});

test("twelve inspiration covers sit immediately after the hero and open a controllable player", async () => {
    const f = await fixture(DEFAULT_BRAND_CONTENT, false);
    try {
        expect(f.host.querySelector(".mv-hero")?.nextElementSibling?.id).toBe("inspiration");
        const cards = [...f.host.querySelectorAll<HTMLButtonElement>(".mv-inspiration-card")];
        expect(cards).toHaveLength(12);
        expect(f.host.querySelectorAll("#inspiration video")).toHaveLength(0);
        expect(f.host.querySelector("#inspiration")?.textContent).not.toContain("来源");
        await act(async () => cards[0].click()); await settle();
        let dialog = f.host.querySelector('[role="dialog"]')!;
        let video = dialog.querySelector<HTMLVideoElement>("video")!;
        expect(video.getAttribute("src")).toBe(BRAND_INSPIRATION_WORKS[0].video!);
        expect(video.muted).toBe(true); expect(video.controls).toBe(true); expect(video.autoplay).toBe(false);
        await key(dialog, "ArrowRight");
        dialog = f.host.querySelector('[role="dialog"]')!;
        expect(dialog.textContent).toContain(BRAND_INSPIRATION_WORKS[1].title);
        expect(video.isConnected).toBe(false);
        video = dialog.querySelector<HTMLVideoElement>("video")!;
        expect(video.getAttribute("src")).toBe(BRAND_INSPIRATION_WORKS[1].video!);
        await key(video, "ArrowRight");
        expect(dialog.textContent).toContain(BRAND_INSPIRATION_WORKS[1].title);
        await key(dialog, "ArrowLeft", { ctrlKey: true });
        expect(dialog.textContent).toContain(BRAND_INSPIRATION_WORKS[1].title);
        await act(async () => video.dispatchEvent(new dom.Event("error")));
        expect(dialog.querySelector('[role="status"]')?.textContent).toContain("暂时无法播放");
        const retry = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("重新加载"))!;
        await act(async () => retry.click());
        expect(dialog.querySelector("video")?.getAttribute("src")).toBe(BRAND_INSPIRATION_WORKS[1].video!);
        await act(async () => [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "关闭播放器")!.click());
        expect(f.host.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement === cards[0]).toBe(true);
    } finally { await f.close(); }
});

test("opening a work requests playback and a blocked request can be started explicitly", async () => {
    const originalPlay = dom.HTMLMediaElement.prototype.play;
    let attempts = 0;
    dom.HTMLMediaElement.prototype.play = function () {
        if (!this.closest(".mv-inspiration-player")) return Promise.resolve();
        attempts += 1;
        if (attempts === 1) return Promise.reject(new Error("NotAllowedError"));
        this.dispatchEvent(new dom.Event("play"));
        this.dispatchEvent(new dom.Event("playing"));
        return Promise.resolve();
    };
    const f = await fixture(DEFAULT_BRAND_CONTENT, false);
    try {
        await act(async () => f.host.querySelector<HTMLButtonElement>(".mv-inspiration-card")!.click()); await settle();
        expect(attempts).toBe(1);
        const play = f.host.querySelector<HTMLButtonElement>('button[aria-label="播放影片"]');
        expect(play).not.toBeNull();
        await act(async () => play!.click());
        expect(attempts).toBe(2);
        expect(f.host.querySelector('button[aria-label="播放影片"]')).toBeNull();
        const video = f.host.querySelector(".mv-inspiration-player video")!;
        await act(async () => video.dispatchEvent(new dom.Event("pause")));
        expect(f.host.querySelector('button[aria-label="播放影片"]')).not.toBeNull();
    } finally { await f.close(); dom.HTMLMediaElement.prototype.play = originalPlay; }
});

test("inspiration preview opens a poster without loading video or exposing an external action", async () => {
    const f = await fixture();
    try {
        await act(async () => f.host.querySelector<HTMLButtonElement>(".mv-inspiration-card")!.click()); await settle();
        const dialog = f.host.querySelector('[role="dialog"]')!;
        expect(dialog.querySelector("img")?.getAttribute("src")).toBe(BRAND_INSPIRATION_WORKS[0].image);
        expect(dialog.querySelector("video")).toBeNull();
        expect(dialog.querySelector("a")).toBeNull();
    } finally { await f.close(); }
});

test("CMS media reports actual failures, resets by resource and uses a fallback only when needed", async () => {
    const fallback = { src: "/fallback.webp", alt: "备选影像" };
    const empty = { resourceId: "", kind: "" as const, alt: "", posterId: "" };
    const f = await mount(<CinemaMedia value={empty} fallback={fallback} />);
    try {
        expect(f.host.querySelector('[role="status"]')).toBeNull();
        expect(f.host.querySelector("img")?.getAttribute("src")).toBe(fallback.src);
        const owned = { ...empty, resourceId: "owned-one", kind: "image" as const, alt: "自有影像" };
        await f.render(<CinemaMedia value={owned} fallback={fallback} />);
        await act(async () => f.host.querySelector("img")!.dispatchEvent(new dom.Event("error")));
        expect(f.host.querySelector('[role="status"]')).not.toBeNull();
        expect(f.host.querySelector("img")?.getAttribute("src")).toBe(fallback.src);
        await f.render(<CinemaMedia value={{ ...owned, resourceId: "owned-two" }} fallback={fallback} />);
        expect(f.host.querySelector('[role="status"]')).toBeNull();
        expect(f.host.querySelector("img")?.getAttribute("src")).toContain("/public/brand-site/media/owned-two");
    } finally { await f.close(); }
});

test("reference video respects reduced motion, manual pause and offscreen visibility", async () => {
    const previousObserver = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver");
    const previousMedia = dom.matchMedia;
    const play = Object.getOwnPropertyDescriptor(dom.HTMLMediaElement.prototype, "play");
    const pause = Object.getOwnPropertyDescriptor(dom.HTMLMediaElement.prototype, "pause");
    let emit!: (visible: boolean) => void;
    let plays = 0, pauses = 0;
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { emit = (visible) => callback([{ isIntersecting: visible }]); }
        observe() {} disconnect() {}
    } });
    dom.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as typeof dom.matchMedia;
    Object.defineProperty(dom.HTMLMediaElement.prototype, "play", { configurable: true, value: async () => { plays++; } });
    Object.defineProperty(dom.HTMLMediaElement.prototype, "pause", { configurable: true, value: () => { pauses++; } });
    const media = { image: "/poster.webp", video: "/film.mp4", alt: "演示影片" };
    const f = await mount(<ReferenceFilm media={media} />);
    try {
        await act(async () => emit(true));
        const video = f.host.querySelector("video")!;
        expect(video.hasAttribute("src")).toBe(false);
        expect(plays).toBe(0);
        await act(async () => f.host.querySelector<HTMLButtonElement>("button")!.click());
        expect(video.getAttribute("src")).toBe(media.video);
        expect(plays).toBe(1);
        await act(async () => video.dispatchEvent(new dom.Event("loadeddata")));
        expect(video.hasAttribute("data-ready")).toBe(true);
        const before = pauses;
        await act(async () => emit(false));
        expect(pauses).toBeGreaterThan(before);
        await act(async () => emit(true));
        expect(plays).toBe(2);
        await act(async () => f.host.querySelector<HTMLButtonElement>("button")!.click());
        await act(async () => { emit(false); emit(true); });
        expect(plays).toBe(2);
        expect(f.host.querySelector("button")?.getAttribute("aria-label")).toBe("播放演示影片");
    } finally {
        await f.close();
        dom.matchMedia = previousMedia;
        if (previousObserver) Object.defineProperty(globalThis, "IntersectionObserver", previousObserver); else Reflect.deleteProperty(globalThis, "IntersectionObserver");
        if (play) Object.defineProperty(dom.HTMLMediaElement.prototype, "play", play);
        if (pause) Object.defineProperty(dom.HTMLMediaElement.prototype, "pause", pause);
    }
});

test("legacy entry copy becomes accurate product previews while custom CMS content is preserved", async () => {
    const base = DEFAULT_BRAND_CONTENT.sections.find((section) => section.id === "entries")!;
    const legacy = { ...base, items: base.items.map((item, index) => ({ ...item, title: ["写下灵感", "展开画布", "推进作品"][index], description: "", link: ["/create", "/canvas", "/projects"][index] })) };
    const f = await fixture({ ...DEFAULT_BRAND_CONTENT, sections: [legacy] });
    try {
        expect([...f.host.querySelectorAll("#entries h3")].map((e) => e.textContent)).toEqual(["AI 视频创作", "创作画布", "短剧项目"]);
        expect(f.host.querySelectorAll("#entries [role=img]")).toHaveLength(3);
        expect(f.host.querySelector("#entries .mpv-canvas")).not.toBeNull();
        expect(f.host.querySelectorAll("#entries .mpv-shots > div")).toHaveLength(3);
        const custom = { ...legacy, items: [{ ...legacy.items[0], title: "管理员自定义标题", description: "自定义说明", media: { resourceId:"custom-entry", kind:"image" as const, alt:"自定义效果图", posterId:"" } }] };
        await f.render({ ...DEFAULT_BRAND_CONTENT, sections:[custom] });
        expect(f.host.textContent).toContain("管理员自定义标题");
        expect(f.host.querySelector("#entries .mc-product-visual")).toBeNull();
        expect(f.host.querySelector("#entries img")?.getAttribute("src")).toContain("custom-entry");
    } finally { await f.close(); }
});
