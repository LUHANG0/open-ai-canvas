import { afterAll, expect, mock, spyOn, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// Only decoding/player I/O is substituted. The real VideoNodeContent hooks, handlers,
// action context and delayed node-update boundary run unchanged.
mock.module("../src/components/video-player", () => ({ VideoPlayer: ({ src, onCanPlay }: { src: string; onCanPlay: () => void }) => <video data-player src={src} onCanPlay={onCanPlay} /> }));
mock.module("../src/components/canvas/canvas-video-preview-image", () => ({ CanvasVideoPreviewImage: () => <img alt="fixture preview" /> }));
const { act } = await import("react"); const { createRoot } = await import("react-dom/client");
const { VideoNodeContent } = await import("../src/components/canvas/canvas-node-media-content");
const { CanvasNodeActionContext } = await import("../src/components/canvas/canvas-node-action-context");
const { canvasThemes } = await import("../src/lib/canvas-theme");
const { updateCanvasNodes } = await import("../src/lib/canvas/canvas-node-timestamps");
const { setActiveUserScope } = await import("../src/lib/user-scope");
const files = await import("../src/services/file-storage");
import type { CanvasNodeData } from "../src/types/canvas";
import type { CanvasNodeContentProps } from "../src/components/canvas/canvas-node-content";

function initial(): CanvasNodeData { return { id: "fixture", type: "video", title: "fixture", width: 420, height: 746, position: { x: 10, y: 20 }, metadata: { content: "/fixture.mp4", storageKey: "video:fixture", taskId: "fixture-task", status: "success" } } as CanvasNodeData; }
async function fixture() {
    setActiveUserScope("fixture-user");
    const url = spyOn(files, "resolveVideoMediaUrl").mockResolvedValue("data:video/mp4;base64,AAAA");
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let nodes = [initial()]; let writes = 0;
    const pending: Array<{ id: string; update: (node: CanvasNodeData) => CanvasNodeData }> = [];
    const actions = { updateMediaNode: (id: string, update: (node: CanvasNodeData) => CanvasNodeData) => pending.push({ id, update }) };
    const render = async () => { const props = { node: nodes[0], theme: canvasThemes.light, mediaActive: true } as CanvasNodeContentProps; await act(async () => { root.render(<CanvasNodeActionContext value={actions}><VideoNodeContent {...props} /></CanvasNodeActionContext>); await Promise.resolve(); }); };
    const measure = async () => {
        const video = host.querySelector<HTMLVideoElement>("video[data-player]")!; expect(video).not.toBeNull();
        Object.defineProperties(video, { videoWidth: { configurable: true, value: 854 }, videoHeight: { configurable: true, value: 480 } });
        await act(async () => video.dispatchEvent(new dom.Event("loadedmetadata"))); return video;
    };
    const flush = () => { for (const { id, update } of pending.splice(0)) { const next = updateCanvasNodes(nodes, new Map([[id, update]])); if (next !== nodes) writes++; nodes = next; } };
    await render();
    return { host, render, measure, flush, get: () => nodes, writes: () => writes, replace: (next: CanvasNodeData[]) => { nodes = next; }, close: async () => { await act(async () => root.unmount()); host.remove(); url.mockRestore(); setActiveUserScope(null); } };
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
