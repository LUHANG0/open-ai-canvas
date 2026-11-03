import { afterAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { ComponentProps } from "react";
import type { CanvasNodeRenderLOD } from "@/lib/canvas/canvas-node-lod";
import type { CanvasNodeData } from "@/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
// The real text editor captures selection during ref detach.
originals.set("HTMLTextAreaElement", Object.getOwnPropertyDescriptor(globalThis, "HTMLTextAreaElement"));
Object.defineProperty(globalThis, "HTMLTextAreaElement", { configurable: true, writable: true, value: dom.HTMLTextAreaElement });
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    CustomEvent: dom.CustomEvent,
    MutationObserver: dom.MutationObserver,
    localStorage: dom.localStorage,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: (fn: FrameRequestCallback) => {
        frames.set(++frameId, fn);
        return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// Intentional module-loading boundary: React DOM and node modules must observe
// the isolated browser globals above, not the host process at static import time.
const { act, createRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useCanvasNodeDetailLOD } = await import("@/pages/canvas/use-canvas-node-detail-lod");
const { CanvasNode } = await import("@/components/canvas/canvas-node");
const { CanvasNodeType } = await import("@/types/canvas");
const { CanvasPlaybackProvider } = await import("@/components/canvas/canvas-playback-context");
const { CanvasPlaybackController } = await import("@/lib/canvas/canvas-playback");
const noop = () => {};
const targets = (lod: CanvasNodeRenderLOD, count = 20) => new Map(Array.from({ length: count }, (_, i) => [`n${i}`, lod]));
async function frame() {
    const queued = [...frames.values()];
    frames.clear();
    await act(async () => {
        for (const callback of queued) callback(0);
    });
}
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function scheduler(initial = targets("preview")) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const ref = createRef<HTMLDivElement>();
    let desired = initial;
    let scope = "project-a";
    let output!: Map<string, CanvasNodeRenderLOD>;
    function Harness() {
        output = useCanvasNodeDetailLOD(scope, desired, ref);
        return <div ref={ref} />;
    }
    const render = async (next: typeof desired, nextScope = scope) => {
        desired = next;
        scope = nextScope;
        await act(async () => root.render(<Harness />));
    };
    await render(initial);
    return {
        host,
        ref,
        render,
        output: () => output,
        cleanup: async () => {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

test("continuous threshold reversals retain chrome; net-zero end commits only the final snapshot", async () => {
    const f = await scheduler();
    try {
        f.ref.current!.dataset.canvasViewportInteracting = "true";
        for (const lod of ["full", "shell", "full", "preview", "full"] as const) {
            await f.render(targets(lod));
            await frame();
            expect([...f.output().values()]).toEqual(Array(20).fill("preview"));
            expect(frames.size).toBe(lod === "preview" ? 0 : 1);
        }
        // No React viewport update accompanies the flag removal.
        delete f.ref.current!.dataset.canvasViewportInteracting;
        await frame();
        expect([...f.output()]).toEqual([...targets("full")]);
        const final = f.output();
        await frame();
        expect(f.output()).toBe(final);
        expect(frames.size).toBe(0);
    } finally {
        await f.cleanup();
    }
});

test("pending snapshots are invalidated by newer targets, gestures, deletion and unmount", async () => {
    const f = await scheduler();
    try {
        await f.render(targets("full"));
        const oldTarget = [...frames.values()];
        expect(oldTarget).toHaveLength(1);
        // A gesture can start before the pending settled callback runs.
        f.ref.current!.dataset.canvasViewportInteracting = "true";
        await frame();
        expect([...f.output()]).toEqual([...targets("preview")]);
        const oldGesture = [...frames.values()];
        expect(oldGesture).toHaveLength(1);
        const latest = new Map<string, CanvasNodeRenderLOD>([
            ["n0", "shell"],
            ["exposed", "full"],
        ]);
        await f.render(latest);
        expect([...f.output()]).toEqual([
            ["n0", "preview"],
            ["exposed", "preview"],
        ]);
        // Even after the flag clears, cancelled callbacks cannot publish old IDs/targets.
        delete f.ref.current!.dataset.canvasViewportInteracting;
        const beforeStale = f.output();
        await act(async () => [...oldTarget, ...oldGesture].forEach((fn) => fn(0)));
        expect(f.output()).toBe(beforeStale);
        await frame();
        expect([...f.output()]).toEqual([...latest]);
        expect(frames.size).toBe(0);
        await f.render(
            new Map([
                ["n0", "full"],
                ["exposed", "shell"],
            ]),
        );
        const afterUnmount = [...frames.values()];
        expect(afterUnmount).toHaveLength(1);
        await f.cleanup();
        await act(async () => afterUnmount.forEach((fn) => fn(0)));
        expect(frames.size).toBe(0);
    } finally {
        if (f.host.isConnected) await f.cleanup();
    }
});

test("static first mount and project replacement preserve target detail; reverse zoom does not tear existing full chrome", async () => {
    const f = await scheduler(targets("full"));
    try {
        expect([...f.output().values()]).toEqual(Array(20).fill("full"));
        expect(frames.size).toBe(0);
        f.ref.current!.dataset.canvasViewportInteracting = "true";
        await f.render(targets("preview"));
        await frame();
        expect([...f.output().values()]).toEqual(Array(20).fill("full"));
        await f.render(targets("shell", 2), "project-b");
        expect([...f.output()]).toEqual([...targets("shell", 2)]);
        expect(frames.size).toBe(0);
    } finally {
        await f.cleanup();
    }
});

test("asynchronously loaded static nodes admit target chrome before paint without a drain", async () => {
    const f = await scheduler(new Map());
    try {
        await f.render(targets("full"));
        expect([...f.output()]).toEqual([...targets("full")]);
        expect(frames.size).toBe(0);
    } finally {
        await f.cleanup();
    }
});

const node = (type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id: "real", type, title: "Detail title", position: { x: 0, y: 0 }, width: 240, height: 160, metadata });
async function actualNode(data: CanvasNodeData, overrides: Partial<ComponentProps<typeof CanvasNode>> = {}) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const playback = new CanvasPlaybackController();
    let props: ComponentProps<typeof CanvasNode> = {
        data,
        scale: 1,
        renderLOD: "full",
        detailLOD: "preview",
        isSelected: false,
        isRelated: false,
        isFocusRelated: false,
        isConnectionTarget: false,
        showImageInfo: false,
        onMouseDown: noop,
        onHoverStart: noop,
        onHoverEnd: noop,
        onConnectStart: noop,
        onResize: noop,
        onTitleChange: noop,
        onContentChange: noop,
        onContextMenu: noop,
        ...overrides,
    };
    const render = async (patch: Partial<typeof props>) => {
        props = { ...props, ...patch };
        await act(async () =>
            root.render(
                <CanvasPlaybackProvider controller={playback}>
                    <CanvasNode {...props} />
                </CanvasPlaybackProvider>,
            ),
        );
    };
    await render({});
    return {
        host,
        render,
        playback,
        header: () => host.querySelector('[aria-label="编辑节点名称：Detail title"]'),
        cleanup: async () => {
            await act(async () => root.unmount());
            playback.clear();
            host.remove();
        },
    };
}

test("real image and video surfaces survive chrome-only changes; content LOD retains its original route", async () => {
    for (const type of [CanvasNodeType.Image, CanvasNodeType.Video]) {
        const f = await actualNode(node(type, { content: "/fixture", status: "success" }));
        try {
            const surface = f.host.querySelector(type === CanvasNodeType.Image ? "img" : ".group\\/video-preview")!;
            expect(surface).not.toBeNull();
            expect(f.header()).toBeNull();
            await f.render({ detailLOD: "full" });
            expect(f.header()).not.toBeNull();
            expect(f.host.contains(surface)).toBe(true);
            await f.render({ detailLOD: "preview", renderLOD: "preview" });
            expect(f.header()).toBeNull();
            expect(f.host.contains(surface)).toBe(true);
            expect(f.host.querySelector("[data-node-lod]")!.getAttribute("data-node-lod")).toBe("preview");
        } finally {
            await f.cleanup();
        }
    }
    const f = await actualNode(node(CanvasNodeType.Config), { renderNodeContent: () => <input aria-label="Project editor" defaultValue="draft" /> });
    try {
        const input = f.host.querySelector<HTMLInputElement>('[aria-label="Project editor"]')!;
        expect(input.value).toBe("draft");
        expect(f.header()).toBeNull();
        await f.render({ detailLOD: "full" });
        expect(f.host.querySelector('[aria-label="Project editor"]')).toBe(input);
        await f.render({ detailLOD: "preview", renderLOD: "preview" });
        expect(f.host.querySelector('[aria-label="Project editor"]')).toBeNull();
    } finally {
        await f.cleanup();
    }
});

test("selection, hover, title/body editing, connection and playback bypass queued chrome; multi-selection does not expand overview editors", async () => {
    const f = await actualNode(node(CanvasNodeType.Text, { content: "body draft" }));
    try {
        await f.render({ isSelected: true, renderLOD: "preview" });
        expect(f.header()).toBeNull();
        await f.render({ renderLOD: "full" });
        expect(f.header()).toBeNull();
        expect(f.host.querySelectorAll("[data-resize-corner]")).toHaveLength(4);
        expect(f.host.querySelector('[aria-label="输入连接点，单击创建节点或拖动连线"]')).not.toBeNull();
        await f.render({ isFocusRelated: true });
        expect(f.header()).not.toBeNull();
        await f.render({ isSelected: false, isFocusRelated: false, renderLOD: "preview", isConnectionTarget: true });
        expect(f.header()).not.toBeNull();
        await f.render({ isConnectionTarget: false });
        expect(f.header()).toBeNull();
        await act(async () => {
            f.host.querySelector("[data-node-id]")!.dispatchEvent(new dom.MouseEvent("mouseover", { bubbles: true }) as unknown as Event);
        });
        expect(f.header()).not.toBeNull();
        await act(async () => {
            (f.header() as HTMLButtonElement).click();
        });
        await act(async () => {
            f.host.querySelector("[data-node-id]")!.dispatchEvent(new dom.MouseEvent("mouseout", { bubbles: true }) as unknown as Event);
        });
        const title = f.host.querySelector('[aria-label="节点名称"]');
        expect(title).not.toBeNull();
        await f.render({ detailLOD: "shell" });
        expect(f.host.querySelector('[aria-label="节点名称"]')).toBe(title);
    } finally {
        await f.cleanup();
    }
    const body = await actualNode(node(CanvasNodeType.Text, { content: "body draft" }), { renderLOD: "preview" });
    try {
        await act(async () => {
            body.host.querySelector(".canvas-node-shell")!.dispatchEvent(new dom.MouseEvent("dblclick", { bubbles: true }) as unknown as Event);
        });
        expect(body.host.querySelector("textarea")!.value).toBe("body draft");
        expect(body.header()).not.toBeNull();
    } finally {
        await body.cleanup();
    }
    // Load the playback dependency only after the isolated DOM boundary above.
    const media = await import("@/services/file-storage");
    const resolve = spyOn(media, "resolveVideoMediaUrl").mockResolvedValue("");
    const video = await actualNode(node(CanvasNodeType.Video, { content: "/video" }), { renderLOD: "preview" });
    try {
        await act(async () => video.playback.play("real", "/video"));
        expect(video.header()).not.toBeNull();
        expect(video.host.querySelector("[data-node-lod]")!.getAttribute("data-node-lod")).toBe("full");
    } finally {
        await video.cleanup();
        resolve.mockRestore();
    }
});

test("focus inside chrome preserves the actual button across downgrade and internal focus moves", async () => {
    const f = await actualNode(node(CanvasNodeType.Text, { content: "body" }), { detailLOD: "full" });
    try {
        const button = f.header() as HTMLButtonElement;
        await act(async () => button.focus());
        await f.render({ detailLOD: "preview" });
        expect(f.header()).toBe(button);
        expect(document.activeElement).toBe(button);
        const action = f.host.querySelector<HTMLButtonElement>('[aria-label="放大编辑文本"]')!;
        await act(async () => action.focus());
        expect(f.header()).toBe(button);
        await act(async () => action.blur());
        expect(f.header()).toBeNull();
    } finally {
        await f.cleanup();
    }
});
