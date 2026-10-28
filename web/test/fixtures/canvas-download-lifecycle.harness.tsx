import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { CanvasNodeData } from "../../src/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const closeProgress = mock(() => {});
const message = { loading: mock(() => closeProgress), success: mock(() => {}), warning: mock(() => {}), error: mock(() => {}) };
mock.module("antd", () => ({ App: { useApp: () => ({ message }) } }));
type Result = { started: number; failed: number; cancelled: boolean };
const jobs: { signal: AbortSignal; resolve: (value: Result) => void; names: string[] }[] = [];
mock.module("../../src/services/browser-download", () => ({
    downloadBrowserMediaBatch: (items: { fileName: string }[], options: { signal: AbortSignal }) => new Promise<Result>((resolve) => {
        jobs.push({ signal: options.signal, resolve, names: items.map((item) => item.fileName) });
        options.signal.addEventListener("abort", () => resolve({ started: 0, failed: 0, cancelled: true }), { once: true });
    }),
}));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useCanvasMediaDownloads } = await import("../../src/pages/canvas/use-canvas-media-downloads");
const { useUserStore } = await import("../../src/stores/use-user-store");
const { setActiveUserScope } = await import("../../src/lib/user-scope");
const user = (id: string) => ({ id, username: id, displayName: id, role: "user" as const, status: "active" as const });
const nodes = [{ id: "image", type: "image", title: "图片", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { storageKey: "resource:image", status: "success" } }, { id: "text", type: "text", title: "文本", position: { x: 100, y: 0 }, width: 100, height: 100, metadata: { content: "some text" } }, { id: "video", type: "video", title: "视频", position: { x: 200, y: 0 }, width: 100, height: 100, metadata: { storageKey: "resource:video", status: "success" } }] as CanvasNodeData[];
async function mount() {
    setActiveUserScope("user-a"); useUserStore.setState({ user: user("user-a"), hydrated: true });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let latest!: ReturnType<typeof useCanvasMediaDownloads>;
    function Fixture({ canvasId }: { canvasId: string }) { latest = useCanvasMediaDownloads(canvasId, "画布"); return null; }
    await act(async () => root.render(<Fixture canvasId="a" />));
    return { state: () => latest, navigate: async () => { await act(async () => root.render(<Fixture canvasId="b" />)); }, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test("one active selection download prevents double submission, reports failures and can start again", async () => {
    const fixture = await mount(); const count = jobs.length;
    try {
        let first!: Promise<void>;
        await act(async () => { first = fixture.state().downloadNodesMedia(nodes); await fixture.state().downloadNodesMedia(nodes); });
        expect(jobs.length).toBe(count + 1); expect(fixture.state().downloadingSelection).toBe(true);
        await act(async () => { jobs.at(-1)!.resolve({ started: 1, failed: 1, cancelled: false }); await first; });
        expect(fixture.state().downloadingSelection).toBe(false);
        expect(message.warning.mock.calls.at(-1)?.[0]).toContain("1 个失败");
        expect(message.warning.mock.calls.at(-1)?.[0]).toContain("跳过 1 个");
        let retry!: Promise<void>;
        await act(async () => { retry = fixture.state().downloadNodesMedia(nodes); });
        expect(jobs.length).toBe(count + 2);
        await act(async () => { jobs.at(-1)!.resolve({ started: 2, failed: 0, cancelled: false }); await retry; });
        expect(fixture.state().downloadingSelection).toBe(false);
    } finally { await fixture.close(); }
});
test("switching away and back aborts the old batch and never publishes its completion", async () => {
    const fixture = await mount(); const successes = message.success.mock.calls.length;
    try {
        let pending!: Promise<void>;
        await act(async () => { pending = fixture.state().downloadNodesMedia(nodes); });
        const job = jobs.at(-1)!;
        await act(async () => {
            useUserStore.setState({ hydrated: false });
            useUserStore.setState({ user: user("user-b"), hydrated: true });
            useUserStore.setState({ user: user("user-a"), hydrated: true });
            await pending;
        });
        expect(job.signal.aborted).toBe(true);
        expect(message.success.mock.calls.length).toBe(successes);
        expect(fixture.state().downloadingSelection).toBe(false);
    } finally { await fixture.close(); }
});
test("canvas navigation and unmount release pending downloads and close the loading message", async () => {
    const fixture = await mount();
    let first!: Promise<void>;
    await act(async () => { first = fixture.state().downloadNodesMedia(nodes); });
    const firstJob = jobs.at(-1)!;
    await fixture.navigate(); await first;
    expect(firstJob.signal.aborted).toBe(true);
    expect(fixture.state().downloadingSelection).toBe(false);
    let second!: Promise<void>;
    await act(async () => { second = fixture.state().downloadNodesMedia(nodes); });
    const lastJob = jobs.at(-1)!;
    await fixture.close(); await second;
    expect(lastJob.signal.aborted).toBe(true); expect(closeProgress).toHaveBeenCalled();
});

afterAll(async () => { mock.restore(); await dom.happyDOM.abort(); for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); });
