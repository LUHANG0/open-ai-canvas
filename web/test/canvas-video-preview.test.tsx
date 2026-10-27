import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLVideoElement: dom.HTMLVideoElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
Object.defineProperties(dom, { innerWidth: { value: 1024, writable: true }, innerHeight: { value: 768, writable: true } });
const pending = new Map<string, (src: string) => void>();
mock.module("../src/services/file-storage", () => ({ resolveVideoMediaUrl: (key: string | undefined, src: string) => {
    if (!key) return Promise.resolve(src);
    const { promise, resolve } = Promise.withResolvers<string>(); pending.set(key, resolve); return promise;
} }));
// The player boundary supplies a native media event; decoding/playback belongs to browser verification.
mock.module("../src/components/video-player", () => ({ VideoPlayer: ({ src, onError }: { src: string; onError: () => void }) => <video src={src} onError={onError} /> }));
// Static imports would initialize React DOM before the DOM globals and storage/player mocks.
const { act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasVideoPreview } = await import("../src/components/canvas/canvas-video-preview");
afterAll(() => { mock.restore(); for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });

test("metadata sizes video window, viewport changes refit, replacement clears dimensions and late URL cannot win", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let closes = 0;
    const render = (storageKey: string) => <CanvasVideoPreview storageKey={storageKey} title="视频预览" onClose={() => closes++} />;
    try {
        await act(async () => root.render(render("first")));
        expect(document.querySelector('[role="status"]')?.textContent).toContain("正在加载视频");
        await act(async () => pending.get("first")!("/first.mp4"));
        const video = document.querySelector("video")!;
        Object.defineProperties(video, { videoWidth: { value: 1080 }, videoHeight: { value: 1920 } });
        await act(async () => video.dispatchEvent(new dom.Event("loadedmetadata")));
        const stage = document.querySelector<HTMLElement>(".canvas-video-preview-stage")!;
        expect(stage.style.height).toBe("700px"); expect(stage.style.width).toBe("393.75px");
        expect(stage.getAttribute("aria-busy")).toBe("false");
        dom.innerHeight = 400;
        await act(async () => dom.dispatchEvent(new dom.Event("resize")));
        expect(stage.style.height).toBe("332px"); expect(stage.style.width).toBe("186.75px");
        await act(async () => root.render(render("stale")));
        await act(async () => root.render(render("new")));
        await act(async () => pending.get("new")!("/new.mp4"));
        await act(async () => pending.get("stale")!("/stale.mp4"));
        const replacement = document.querySelector("video")!;
        expect(replacement.getAttribute("src")).toBe("/new.mp4");
        expect(document.querySelector<HTMLElement>(".canvas-video-preview-stage")!.style.width).toBe("320px");
        await act(async () => replacement.dispatchEvent(new dom.Event("error")));
        expect(document.querySelector('[role="alert"]')?.textContent).toContain("视频暂时无法播放");
        await act(async () => replacement.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })));
        expect(closes).toBe(1);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("keyboard-opened video preview restores focus after Escape unmounts the real modal", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    function PreviewFlow() {
        const [open, setOpen] = useState(false);
        // happy-dom has no native Enter-to-click default action; model that activation here.
        return <><button onKeyDown={(event) => { if (event.key === "Enter") setOpen(true); }}>放大预览</button>{open ? <CanvasVideoPreview src="/focus.mp4" title="视频预览" onClose={() => setOpen(false)} /> : null}</>;
    }
    try {
        await act(async () => root.render(<PreviewFlow />));
        const opener = host.querySelector("button")!;
        opener.focus();
        await act(async () => opener.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
        const close = document.querySelector<HTMLButtonElement>('button[aria-label="关闭视频预览"]')!;
        close.focus();
        expect(document.activeElement).toBe(close);
        await act(async () => close.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })));
        expect(document.querySelector(".canvas-video-preview-stage")).toBeNull();
        expect(document.activeElement).toBe(opener);
    } finally { await act(async () => root.unmount()); host.remove(); }
});
