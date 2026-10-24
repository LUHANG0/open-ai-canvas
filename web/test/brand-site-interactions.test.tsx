import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BrandSite } = await import("../src/components/brand/brand-site");
const { DEFAULT_BRAND_CONTENT } = await import("../src/services/api/brand-site");
const { BRAND_TECHNIQUES } = await import("../src/components/brand/brand-techniques");
type BrandContent = typeof DEFAULT_BRAND_CONTENT;

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

const withProcess = { ...DEFAULT_BRAND_CONTENT, sections: DEFAULT_BRAND_CONTENT.sections.map((section) => section.id === "process" ? { ...section, visible: true } : section) };
async function fixture(content = withProcess, scope = ".mc-process-stage", preview = true) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = async (next: BrandContent) => { await act(async () => root.render(<BrandSite content={next} preview={preview} />)); };
    await render(content);
    const tabs = () => [...host.querySelectorAll<HTMLButtonElement>(`${scope} [role="tab"]`)];
    const panel = () => host.querySelector<HTMLDivElement>(`${scope} [role="tabpanel"]:not([hidden])`)!;
    const key = async (index: number, key: string, options: KeyboardEventInit = {}, prevented = false) => {
        const event = new dom.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
        if (prevented) event.preventDefault();
        await act(async () => tabs()[index].dispatchEvent(event));
    };
    return { host, render, tabs, panel, key, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test("real process tabs select once, keep roving focus and respect keyboard boundaries", async () => {
    const f = await fixture();
    try {
        const selected = () => f.tabs().findIndex((tab) => tab.getAttribute("aria-selected") === "true");
        const check = (index: number) => {
            expect(selected()).toBe(index);
            expect(f.tabs().filter((tab) => tab.tabIndex === 0)).toEqual([f.tabs()[index]]);
            expect(f.host.querySelectorAll('.mc-process-stage [role="tabpanel"]:not([hidden])')).toHaveLength(1);
            expect(f.tabs()[index].getAttribute("aria-controls")).toBe(f.panel().id);
            expect(f.panel().getAttribute("aria-labelledby")).toBe(f.tabs()[index].id);
        };
        check(0);
        await act(async () => f.tabs()[2].click());
        check(2);
        expect(f.panel().querySelector("img")?.getAttribute("src")).toBe("/brand/v5/story-detail.webp");
        for (const [from, key, to] of [[2, "ArrowDown", 3], [3, "ArrowDown", 0], [0, "ArrowUp", 3], [3, "Home", 0], [0, "End", 3], [3, "ArrowLeft", 2]] as const) {
            await f.key(from, key);
            check(to);
            expect(document.activeElement).toBe(f.tabs()[to]);
        }
        for (const options of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
            await f.key(2, "ArrowDown", options);
            check(2);
        }
        await f.key(2, "ArrowDown", {}, true);
        check(2);
        await f.key(2, "Tab");
        check(2);
        const link = f.host.querySelector<HTMLAnchorElement>(".mc-primary")!;
        const click = new dom.MouseEvent("click", { bubbles: true, cancelable: true });
        await act(async () => link.dispatchEvent(click));
        expect(click.defaultPrevented).toBe(true);
        expect(link.getAttribute("href")).toBe("/login?next=%2Fcreate");
    } finally { await f.close(); }
});

test("creative methods match the real preset catalog, select by focus and preserve preview boundaries", async () => {
    const catalog = await import("../../backend/internal/skills/seed/presets.json");
    const f = await fixture(DEFAULT_BRAND_CONTENT, ".mc-techniques");
    try {
        const choices = [...f.host.querySelectorAll<HTMLButtonElement>(".mc-technique-choice")];
        expect(choices).toHaveLength(4);
        for (let index = 0; index < BRAND_TECHNIQUES.length; index++) {
            const technique = BRAND_TECHNIQUES[index];
            expect(catalog.presets.find((preset) => preset.presetId === technique.presetId)?.name).toBe(technique.title);
            await act(async () => choices[index].focus());
            expect(choices[index].getAttribute("aria-pressed")).toBe("true");
            expect(f.host.querySelector(".mc-technique-copy h3")?.textContent).toBe(technique.title);
            expect([...f.host.querySelectorAll(".mc-technique-steps li span")].map((step) => step.textContent)).toEqual(technique.steps);
        }
        expect(f.host.querySelectorAll(".mc-techniques video[src]")).toHaveLength(0);
        expect(f.host.querySelector(".mc-technique-playback")).toBeNull();
        const link = f.host.querySelector<HTMLAnchorElement>(".mc-techniques-heading a")!;
        const click = new dom.MouseEvent("click", { bubbles: true, cancelable: true });
        await act(async () => link.dispatchEvent(click));
        expect(click.defaultPrevented).toBe(true);
        expect(link.getAttribute("href")).toBe("/login?next=%2Fskills");
    } finally { await f.close(); }
});

test("CMS supports twelve scenes, custom video lifecycle, odd items and empty preview", async () => {
    const base = DEFAULT_BRAND_CONTENT.sections.find((section) => section.id === "process")!;
    const items = Array.from({ length: 12 }, (_, index) => ({ ...base.items[index % 4], title: `阶段 ${index + 1}`, description: `完整说明 ${index + 1}`, link: "/canvas" }));
    items[1] = { ...items[1], media: { resourceId: "owned-film", kind: "video", alt: "自定义影片", posterId: "owned-poster" } };
    const content = (count: number): BrandContent => ({ ...DEFAULT_BRAND_CONTENT, sections: [{ ...base, visible: true, items: items.slice(0, count) }] });
    const f = await fixture(content(12));
    try {
        expect(f.tabs()).toHaveLength(12);
        expect(f.host.querySelectorAll("video[src]")).toHaveLength(0);
        await act(async () => f.tabs()[1].click());
        const video = f.panel().querySelector("video")!;
        expect(video.getAttribute("src")).toContain("/admin/settings/brand-site/media/owned-film");
        expect(video.getAttribute("poster")).toContain("/admin/settings/brand-site/media/owned-poster");
        expect(video.controls).toBe(true);
        expect(video.autoplay).toBe(false);
        await f.key(1, "End");
        expect(video.isConnected).toBe(false);
        expect(f.panel().textContent).toContain("完整说明 12");
        expect(f.panel().querySelector("a")?.getAttribute("href")).toBe("/canvas");
        await f.render(content(3));
        expect(f.tabs()).toHaveLength(3);
        expect(f.panel().textContent).toContain("完整说明 3");
        await f.render(content(0));
        expect(f.tabs()).toHaveLength(0);
        expect(f.host.querySelectorAll('.mc-process-stage [role="tabpanel"]')).toHaveLength(0);
        await f.render(content(1));
        expect(f.panel().textContent).toContain("完整说明 1");
    } finally { await f.close(); }
});

test("retired creation-steps section is absent and every workflow node drags from its body", async () => {
    const f = await fixture(DEFAULT_BRAND_CONTENT);
    try {
        expect(f.host.querySelector("#entries")).toBeNull();
        const area = f.host.querySelector(".mc-workflow-theater")!;
        const node = area.querySelector<HTMLElement>(".mc-demo-node")!;
        const media = node.querySelector("figure")!;
        const viewport = area.querySelector(".mc-demo-viewport")!;
        const path = area.querySelector(".mc-demo-connections path")!;
        const initial = node.style.transform, connection = path.getAttribute("d");
        const pointer = async (target: Element, type: string, x: number, y: number) => act(async () => target.dispatchEvent(new dom.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, button: 0, clientX: x, clientY: y })));
        await pointer(media, "pointerdown", 160, 100);
        await pointer(viewport, "pointermove", -1200, -1200);
        await pointer(viewport, "pointerup", -1200, -1200);
        expect(node.style.transform).not.toBe(initial);
        expect(node.style.transform).toContain("-");
        expect(path.getAttribute("d")).not.toBe(connection);
        const moved = node.style.transform;
        await pointer(viewport, "pointermove", 100, 100);
        expect(node.style.transform).toBe(moved);
        const handle = node.querySelector("button")!;
        await act(async () => handle.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })));
        expect(node.style.transform).toBe(initial);
        const video = node.querySelector("video")!;
        video.controls = true;
        await pointer(video, "pointerdown", 160, 100);
        await pointer(viewport, "pointermove", 400, 400);
        await pointer(viewport, "pointerup", 400, 400);
        expect(node.style.transform).toBe(initial);
        const controls = [...area.querySelectorAll<HTMLButtonElement>(".mc-demo-toolbar button")];
        const output = area.querySelector("output")!;
        const originalZoom = output.textContent;
        await act(async () => controls[1].click());
        expect(output.textContent).not.toBe(originalZoom);
        for (let i = 0; i < 10; i++) await act(async () => controls[1].click());
        expect(controls[1].disabled).toBe(true);
        await act(async () => controls[2].click());
        expect(output.textContent).toBe(originalZoom);
    } finally { await f.close(); }
});

test("minimal glass header and film rail retain keyboard and preview navigation", async () => {
    const f = await fixture(DEFAULT_BRAND_CONTENT, ".mc-workflow", false);
    try {
        const header = f.host.querySelector("header")!;
        expect(header.querySelectorAll("a")).toHaveLength(2);
        expect(header.textContent).not.toContain("登录");
        const images = [...f.host.querySelectorAll<HTMLButtonElement>(".mc-film-thumb")];
        expect(images).toHaveLength(8);
        const key = async (index: number, key: string, options: KeyboardEventInit = {}) => act(async () => images[index].dispatchEvent(new dom.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })));
        await key(0, "End");
        expect(images[7].getAttribute("aria-pressed")).toBe("true");
        expect(document.activeElement).toBe(images[7]);
        await key(7, "ArrowRight");
        expect(images[0].getAttribute("aria-pressed")).toBe("true");
        await key(0, "ArrowRight", { ctrlKey: true });
        expect(images[0].getAttribute("aria-pressed")).toBe("true");
    } finally { await f.close(); }
});

test("eight workflow types replace their canvas and preview keeps remote videos unloaded", async () => {
    const f = await fixture(DEFAULT_BRAND_CONTENT);
    try {
        const buttons = [...f.host.querySelectorAll<HTMLButtonElement>(".mc-theater-categories button")];
        expect(buttons).toHaveLength(8);
        expect(f.host.querySelectorAll(".mc-workflow-theater .mc-demo-node")).toHaveLength(4);
        const original = f.host.querySelector(".mc-theater-scene")!;
        await act(async () => buttons[1].click());
        expect(original.isConnected).toBe(false);
        expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
        expect(f.host.querySelectorAll(".mc-workflow-theater .mc-demo-node")).toHaveLength(3);
        expect(f.host.querySelector(".mc-theater-heading h3")?.textContent).toContain("造型");
        for (const button of buttons) await act(async () => button.click());
        expect(f.host.querySelector(".mc-theater-heading h3")?.textContent).toContain("空间");
        await act(async () => {
            buttons[6].dispatchEvent(new dom.PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
            await new Promise((resolve) => setTimeout(resolve, 160));
        });
        expect(buttons[6].getAttribute("aria-pressed")).toBe("true");
        expect(f.host.querySelector(".mc-theater-heading h3")?.textContent).toContain("标识");
        expect(f.host.querySelector(".mc-theater-background video")?.getAttribute("poster")).toContain("Image(130)");
        await act(async () => {
            buttons[1].dispatchEvent(new dom.PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
            await new Promise((resolve) => setTimeout(resolve, 160));
        });
        expect(buttons[6].getAttribute("aria-pressed")).toBe("true");
        expect(f.host.querySelectorAll(".mc-workflow-theater video[src]")).toHaveLength(0);
        expect(f.host.querySelector(".mc-theater-footer")?.textContent).not.toContain("FLORA");
        expect(f.host.querySelectorAll(".mc-orbit button")).toHaveLength(0);
    } finally { await f.close(); }
});
