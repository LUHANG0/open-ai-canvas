import { afterAll, expect, mock, spyOn, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ MutationObserver: dom.MutationObserver, window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// Only decoding/player I/O is substituted. The real VideoNodeContent hooks, handlers,
// action context and delayed node-update boundary run unchanged.
mock.module("../src/services/canvas-video-preview", () => ({ hydrateCanvasVideoPreview: async () => null }));
mock.module("../src/components/video-player", () => ({ VideoPlayer: ({ src, paused, onCanPlay, onEnded, onPause, onPlay, onPlaying, onError, initialTime }: any) => <video data-player data-start={initialTime} data-paused={String(paused)} src={src} onError={onError} onCanPlay={onCanPlay} onEnded={onEnded} onPause={onPause} onPlay={onPlay} onPlaying={onPlaying} /> }));
mock.module("../src/components/canvas/canvas-video-preview-image", () => ({ CanvasVideoPreviewImage: () => <img alt="fixture preview" /> }));
const { act } = await import("react"); const { createRoot } = await import("react-dom/client");
const { VideoNodeContent } = await import("../src/components/canvas/canvas-node-media-content");
const { CanvasPlaybackProvider, useCanvasPlaybackController } = await import("../src/components/canvas/canvas-playback-context");
const { CanvasNodeActionContext } = await import("../src/components/canvas/canvas-node-action-context");
const { canvasThemes } = await import("../src/lib/canvas-theme");
const { updateCanvasNodes } = await import("../src/lib/canvas/canvas-node-timestamps");
const { setActiveUserScope } = await import("../src/lib/user-scope");
const files = await import("../src/services/file-storage");
import type { CanvasNodeData } from "../src/types/canvas";
import type { CanvasNodeContentProps } from "../src/components/canvas/canvas-node-content";

function initial(): CanvasNodeData { return { id: "fixture", type: "video", title: "fixture", width: 420, height: 746, position: { x: 10, y: 20 }, metadata: { content: "/fixture.mp4", storageKey: "video:fixture", taskId: "fixture-task", status: "success" } } as CanvasNodeData; }
async function fixture(activate = true, resolve = async () => "data:video/mp4;base64,AAAA") {
    let playback: NonNullable<ReturnType<typeof useCanvasPlaybackController>>;
    function CapturePlayback() { playback = useCanvasPlaybackController()!; return null; }
    setActiveUserScope("fixture-user");
    const url = spyOn(files, "resolveVideoMediaUrl").mockImplementation(resolve);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let nodes = [initial()]; let writes = 0; const playbackRequests: Array<string | null> = [];
    const pending: Array<{ id: string; update: (node: CanvasNodeData) => CanvasNodeData }> = [];
    const actions = { updateMediaNode: (id: string, update: (node: CanvasNodeData) => CanvasNodeData) => pending.push({ id, update }) };
    const render = async () => { const props = { node: nodes[0], theme: canvasThemes.light,  } as CanvasNodeContentProps; await act(async () => { root.render(<CanvasPlaybackProvider><CapturePlayback /><CanvasNodeActionContext value={actions}><div data-node-id={nodes[0].id}><VideoNodeContent {...props} /></div></CanvasNodeActionContext></CanvasPlaybackProvider>); await Promise.resolve(); }); await act(async () => { if (activate) (host.querySelector('button[data-canvas-play-button]') as HTMLButtonElement | null)?.click(); await Promise.resolve(); }); };
    const measure = async () => {
        const video = host.querySelector<HTMLVideoElement>("video[data-player]")!; expect(video).not.toBeNull();
        Object.defineProperties(video, { readyState: { configurable: true, value: 4 }, videoWidth: { configurable: true, value: 854 }, videoHeight: { configurable: true, value: 480 } });
        await act(async () => { video.dispatchEvent(new dom.Event("play")); video.dispatchEvent(new dom.Event("playing")); video.dispatchEvent(new dom.Event("loadedmetadata")); }); return video;
    };
    const flush = () => { for (const { id, update } of pending.splice(0)) { const next = updateCanvasNodes(nodes, new Map([[id, update]])); if (next !== nodes) writes++; nodes = next; } };
    await render();
    return { host, render, measure, flush, playback: playback!, playbackRequests, get: () => nodes, writes: () => writes, replace: (next: CanvasNodeData[]) => { nodes = next; }, close: async () => { await act(async () => root.unmount()); host.remove(); url.mockRestore(); setActiveUserScope(null); } };
}

test("real loadedmetadata resizes once; repeated events keep node identity and timestamps", async () => {
    const f = await fixture();
    try {
        await f.measure(); f.flush(); expect(f.get()[0].width).toBe(720); expect(f.writes()).toBe(1);
        await f.render(); f.flush(); const first = f.get()[0];
        await f.measure(); f.flush(); expect(f.get()[0]).toBe(first); expect(f.writes()).toBe(1);
    } finally { await f.close(); }
});

test("queued metadata from a replaced player or another account cannot modify the new node", async () => {
    const f = await fixture();
    try {
        const oldPlayer = await f.measure();
        const replaced = { ...initial(), metadata: { ...initial().metadata, storageKey: "video:replacement", taskId: "replacement-task" } };
        f.replace([replaced]); await f.render(); f.flush(); expect(f.get()[0]).toBe(replaced); expect(oldPlayer.isConnected).toBe(false);
        await f.measure(); setActiveUserScope("another-user"); f.flush(); expect(f.get()[0]).toBe(replaced);
    } finally { await f.close(); }
});

test("a manual resize or deletion before the real delayed update wins", async () => {
    const f = await fixture();
    try {
        await f.measure();
        const resized = { ...initial(), width: 222, height: 333, metadata: { ...initial().metadata, manualSize: true } };
        f.replace([resized]); f.flush(); expect(f.get()[0].width).toBe(222); expect(f.get()[0].height).toBe(333); expect(f.get()[0].metadata?.naturalWidth).toBe(854);
        await f.render(); await f.measure(); f.replace([]); f.flush(); expect(f.get()).toEqual([]);
    } finally { await f.close(); }
});

afterAll(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });


test("explicit pause and end keep the mounted player for continuation or replay", async () => {
    const f = await fixture();
    try {
        const video = await f.measure();
        await act(async () => { video.dispatchEvent(new dom.Event("pause")); video.dispatchEvent(new dom.Event("seeked")); });
        expect(f.playbackRequests).toEqual([]);
        await act(async () => { video.dispatchEvent(new dom.Event("ended")); await new Promise(resolve => setTimeout(resolve, 0)); });
        expect(video.isConnected).toBe(true);
        expect(video.getAttribute("data-paused")).toBe("true");
    } finally { await f.close(); }
});


test("real node keeps one player across hover, explicit playback, pause and resume", async () => {
    const f = await fixture(false);
    try {
        await act(async () => f.playback.preview("fixture", "video:fixture"));
        await f.measure(); const first = f.host.querySelector("video")!;
        first.currentTime = 4.5;
        await act(async () => first.dispatchEvent(new dom.Event("timeupdate")));
        await act(async () => f.playback.play("fixture", "video:fixture"));
        expect(f.host.querySelector("video")).toBe(first);
        expect(f.playback.position(f.playback.getSnapshot()!.token)).toBe(4.5);
        await act(async () => f.playback.pause());
        expect(first.getAttribute("data-paused")).toBe("true");
        await act(async () => f.playback.preview("fixture", "video:fixture"));
        expect(first.getAttribute("data-paused")).toBe("true");
        await act(async () => f.playback.play("fixture", "video:fixture"));
        expect(f.host.querySelector("video")).toBe(first);
        expect(first.getAttribute("data-paused")).toBe("false");
    } finally { await f.close(); }
});


test("retry after an unavailable source starts a fresh attempt without inheriting the failed intent", async () => {
    let attempts = 0;
    const f = await fixture(true, async () => ++attempts === 1 ? "" : "data:video/mp4;base64,AAAA");
    try {
        expect(f.playback.getSnapshot()?.status).toBe("error");
        await f.render();
        expect(attempts).toBe(2);
        expect(f.host.querySelector("video")).not.toBeNull();
        expect(f.playback.getSnapshot()?.intent).toBe("play");
        await f.measure(); expect(f.playback.getSnapshot()?.status).toBe("playing");
    } finally { await f.close(); }
});


test("resource recovery remounts at the last decoded position and honors pause during recovery", async () => {
    const resources = await import("../src/services/api/resources");
    let finishRefresh!: (value: any) => void;
    const refresh = spyOn(resources, "refreshResource").mockImplementation(() => new Promise(resolve => { finishRefresh = resolve; }));
    const access = spyOn(resources, "getResourceAccess").mockResolvedValue({ url: "/recovered.mp4", actualVariant: "playback" } as any);
    const f = await fixture(false);
    try {
        f.replace([{ ...initial(), metadata: { ...initial().metadata, storageKey: "resource:fixture" } }]); await f.render();
        await act(async () => f.playback.play("fixture", "resource:fixture"));
        const video = await f.measure(); video.currentTime = 8;
        await act(async () => video.dispatchEvent(new dom.Event("error")));
        expect(f.playback.getSnapshot()?.status).toBe("recovering");
        expect(f.host.querySelector("video")).toBeNull();
        await act(async () => f.playback.pause());
        await act(async () => { finishRefresh({ status: "ready", playbackStatus: "ready", provider: "local" }); await Promise.resolve(); });
        const recovered = f.host.querySelector("video")!;
        expect(recovered).not.toBeNull(); expect(recovered.getAttribute("data-start")).toBe("8");
        expect(recovered.getAttribute("data-paused")).toBe("true");
        expect(f.playback.getSnapshot()?.intent).toBe("pause");
    } finally { await f.close(); refresh.mockRestore(); access.mockRestore(); }
});


test("Escape belongs to a visible canvas popup before it can pause media", async () => {
    const f = await fixture();
    const popup = document.createElement("div"); popup.className = "canvas-toolbar-popover"; document.body.append(popup);
    try {
        await f.measure();
        await act(async () => window.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(f.playback.getSnapshot()?.intent).toBe("play");
        popup.remove();
        await act(async () => window.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(f.playback.getSnapshot()).toBeNull();
    } finally { popup.remove(); await f.close(); }
});

test("window blur and a hidden document suspend playback without a user pause", async () => {
    const f = await fixture();
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
    try {
        await f.measure();
        await act(async () => window.dispatchEvent(new dom.Event("blur")));
        expect(f.playback.getSnapshot()?.intent).toBe("pause");
        expect(f.playback.getSnapshot()?.pauseReason).toBe("blur");
        await act(async () => f.playback.play("fixture", "video:fixture"));
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        await act(async () => document.dispatchEvent(new dom.Event("visibilitychange")));
        expect(f.playback.getSnapshot()?.intent).toBe("pause");
        expect(f.playback.getSnapshot()?.pauseReason).toBe("hidden");
    } finally {
        if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor); else Reflect.deleteProperty(document, "hidden");
        await f.close();
    }
});

test("blur cancels a hover that is still waiting for its activation delay", async () => {
    const f = await fixture(false);
    try {
        const surface = f.host.querySelector(".group\\/video-preview")!;
        await act(async () => {
            surface.dispatchEvent(new dom.PointerEvent("pointerenter", { pointerType: "mouse", buttons: 0 }));
            window.dispatchEvent(new dom.Event("blur"));
            await new Promise(resolve => setTimeout(resolve, 400));
        });
        expect(f.playback.getSnapshot()).toBeNull();
    } finally { await f.close(); }
});

test("the decoded poster stays mounted while hover loads, plays and returns to idle", async () => {
    const f = await fixture(false);
    try {
        f.replace([{ ...initial(), metadata: { ...initial().metadata, previewContent: "data:image/png;base64,poster" } }]);
        await f.render();
        const poster = f.host.querySelector("img")!;
        expect(poster).not.toBeNull();
        await act(async () => f.playback.preview("fixture", "video:fixture"));
        expect(f.host.querySelector("img")).toBe(poster);
        expect(poster.isConnected).toBe(true);
        await f.measure();
        await act(async () => f.playback.play("fixture", "video:fixture"));
        expect(f.host.querySelector("img")).toBe(poster);
        await act(async () => f.playback.dismiss());
        expect(f.host.querySelector("img")).toBe(poster);
        await act(async () => f.playback.preview("fixture", "video:fixture"));
        expect(f.host.querySelector("img")).toBe(poster);
        f.replace([{ ...initial(), metadata: { ...initial().metadata, storageKey: "video:replacement", previewContent: "data:image/png;base64,replacement" } }]);
        await f.render();
        expect(f.host.querySelector("img")).not.toBe(poster);
        expect(poster.isConnected).toBe(false);
    } finally { await f.close(); }
});
