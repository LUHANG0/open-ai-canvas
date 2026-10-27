import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
Object.defineProperties(dom, {
    innerWidth: { configurable: true, writable: true, value: 1024 },
    innerHeight: { configurable: true, writable: true, value: 756 },
});
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const pending = new Map<string, (value: string) => void>();
mock.module("../src/services/image-storage", () => ({
    resolveImageUrl: (storageKey: string | undefined, src: string) => {
        if (!storageKey) return Promise.resolve(src);
        const { promise, resolve } = Promise.withResolvers<string>();
        pending.set(storageKey, resolve);
        return promise;
    },
}));
// React DOM and AntD must detect the installed DOM; storage mocks must precede component loading.
const { act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasImagePreview } = await import("../src/components/canvas/canvas-image-preview");
afterAll(() => {
    mock.restore();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    dom.happyDOM.abort();
});

function button(label: string) {
    return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}
async function loadImage(width = 2000, height = 1000) {
    const image = document.querySelector<HTMLImageElement>(".canvas-image-preview-image")!;
    Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } });
    await act(async () => image.dispatchEvent(new dom.Event("load")));
    return image;
}

test("real preview sizes images for fit, bounded zoom and resize, then resets on a new source", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    let leaked = 0;
    const render = (src: string) => <div onWheel={() => leaked++} onPointerDown={() => leaked++} onKeyDown={() => leaked++} onClick={() => leaked++}><CanvasImagePreview src={src} alt="分镜参考图" onClose={() => {}} /></div>;
    try {
        await act(async () => root.render(render("/first.png")));
        expect(button("放大图片").disabled).toBe(true);
        const image = await loadImage();
        expect(image.alt).toBe("分镜参考图");
        expect(image.style.width).toBe("1000px");
        expect(image.style.height).toBe("500px");
        await act(async () => button("放大图片").click());
        expect(image.style.width).toBe("1250px");
        expect(image.style.height).toBe("625px");
        const stage = document.querySelector<HTMLElement>(".canvas-image-preview-stage")!;
        stage.scrollTop = 100; stage.scrollLeft = 100;
        await act(async () => document.querySelector<HTMLButtonElement>(".canvas-image-preview-fit")!.click());
        expect(image.style.width).toBe("1000px");
        expect(stage.scrollTop).toBe(0); expect(stage.scrollLeft).toBe(0);
        for (let i = 0; i < 20; i++) await act(async () => button("放大图片").click());
        expect(image.style.width).toBe("4000px"); expect(button("放大图片").disabled).toBe(true);
        for (let i = 0; i < 20; i++) await act(async () => button("缩小图片").click());
        expect(image.style.width).toBe("250px"); expect(button("缩小图片").disabled).toBe(true);
        dom.innerWidth = 524;
        await act(async () => dom.dispatchEvent(new dom.Event("resize")));
        expect(image.style.width).toBe("125px");
        for (const type of ["wheel", "pointerdown", "click"]) stage.dispatchEvent(new dom.Event(type, { bubbles: true }));
        stage.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
        expect(leaked).toBe(0);
        await act(async () => root.render(render("/second.png")));
        expect(button("放大图片").disabled).toBe(true);
        expect(document.querySelector("output")?.textContent).toBe("100%");
        const second = await loadImage(500, 2000);
        expect(second.style.width).toBe("150px"); expect(second.style.height).toBe("600px");
    } finally { dom.innerWidth = 1024; await act(async () => root.unmount()); host.remove(); }
});

test("source replacement ignores late resolution; load failures disable zoom; AppModal retains Escape and mask close", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    let closes = 0;
    const onClose = () => { closes++; };
    try {
        await act(async () => root.render(<CanvasImagePreview storageKey="old" onClose={onClose} />));
        await act(async () => root.render(<CanvasImagePreview storageKey="new" onClose={onClose} />));
        await act(async () => pending.get("new")!("/new.png"));
        await act(async () => pending.get("old")!("/old.png"));
        const image = document.querySelector<HTMLImageElement>(".canvas-image-preview-image")!;
        expect(image.getAttribute("src")).toBe("/new.png");
        await act(async () => image.dispatchEvent(new dom.Event("error")));
        expect(document.querySelector('[role="alert"]')?.textContent).toContain("图片暂时无法显示");
        expect(button("放大图片").disabled).toBe(true);
        const wrap = document.querySelector<HTMLElement>(".ant-modal-wrap")!;
        await act(async () => image.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })));
        expect(closes).toBe(1);
        // Tab must reach the modal handler rather than being stopped by the canvas boundary.
        let tabReachedModal = false;
        wrap.addEventListener("keydown", (event) => { if (event.key === "Tab") tabReachedModal = true; });
        await act(async () => image.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Tab", keyCode: 9, bubbles: true })));
        expect(tabReachedModal).toBe(true);
        await act(async () => {
            wrap.dispatchEvent(new dom.MouseEvent("mousedown", { bubbles: true }));
            wrap.click();
        });
        expect(closes).toBe(2);
        await act(async () => button("关闭图片预览").click());
        expect(closes).toBe(3);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("square, landscape, portrait and small assets fit their intrinsic media window on short viewports", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
        for (const [width, height, expectedWidth, expectedHeight] of [[1200, 1200, 644, 644], [2000, 1000, 1000, 500], [500, 2000, 150, 600], [80, 60, 80, 60]]) {
            await act(async () => root.render(<CanvasImagePreview src={`/${width}-${height}.png`} onClose={() => {}} />));
            const image = await loadImage(width, height);
            const stage = document.querySelector<HTMLElement>(".canvas-image-preview-stage")!;
            expect(stage.style.width).toBe(`${expectedWidth}px`);
            expect(stage.style.height).toBe(`${expectedHeight}px`);
            expect(image.style.width).toBe(stage.style.width);
            expect(image.style.height).toBe(stage.style.height);
        }
        dom.innerHeight = 280;
        await act(async () => dom.dispatchEvent(new dom.Event("resize")));
        await act(async () => root.render(<CanvasImagePreview src="/short.png" onClose={() => {}} />));
        const image = await loadImage(1000, 1000);
        expect(image.style.height).toBe("124px");
        dom.innerWidth = 100;
        await act(async () => dom.dispatchEvent(new dom.Event("resize")));
        expect(image.style.width).toBe("76px");
        expect(image.style.height).toBe("76px");
    } finally { await act(async () => root.unmount()); host.remove(); dom.innerWidth = 1024; dom.innerHeight = 756; }
});

test("conditionally mounted image preview returns focus to its opener after Escape, close button and mask", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    function PreviewFlow() {
        const [open, setOpen] = useState(false);
        return <><button onClick={() => setOpen(true)}>打开图片</button>{open ? <CanvasImagePreview src="/focus.png" onClose={() => setOpen(false)} /> : null}</>;
    }
    try {
        await act(async () => root.render(<PreviewFlow />));
        const opener = host.querySelector("button")!;
        for (const close of ["escape", "button", "mask"]) {
            opener.focus();
            await act(async () => opener.click());
            const closeButton = button("关闭图片预览");
            closeButton.focus();
            expect(document.activeElement).toBe(closeButton);
            await act(async () => {
                if (close === "escape") closeButton.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
                else if (close === "button") closeButton.click();
                else {
                    const wrap = document.querySelector<HTMLElement>(".ant-modal-wrap")!;
                    wrap.dispatchEvent(new dom.MouseEvent("mousedown", { bubbles: true })); wrap.click();
                }
            });
            expect(document.querySelector(".canvas-image-preview-stage")).toBeNull();
            expect(document.activeElement).toBe(opener);
        }
    } finally { await act(async () => root.unmount()); host.remove(); }
});
