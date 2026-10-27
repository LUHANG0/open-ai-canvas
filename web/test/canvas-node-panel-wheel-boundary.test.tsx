import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { ViewportTransform } from "@/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, HTMLTextAreaElement: dom.HTMLTextAreaElement,
    Element: dom.Element, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    localStorage: dom.localStorage, sessionStorage: dom.sessionStorage,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// Isolate theme and asset persistence only. The panel, rich/plain editor, viewport and layout subscriptions are real.
mock.module("@/stores/canvas/use-canvas-theme-store", () => ({ useActiveTheme: () => "light" }));
mock.module("@/stores/use-asset-store", () => ({ useAssetStore: (select: (state: { assets: never[] }) => unknown) => select({ assets: [] }) }));
const { act, createRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasViewport } = await import("@/components/canvas/canvas-viewport");
const { CanvasNodePanelOverlay } = await import("@/components/canvas/canvas-workspace-overlays");
const { CanvasResourceMentionTextarea } = await import("@/components/canvas/canvas-resource-mention-textarea");
const { CanvasNodeType } = await import("@/types/canvas");

afterAll(async () => {
    await dom.happyDOM.abort(); mock.restore();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(rich: boolean) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const containerRef = createRef<HTMLDivElement>();
    const previews: ViewportTransform[] = [];
    const commits: ViewportTransform[] = [];
    const changes: string[] = [];
    const reference: CanvasResourceReference = { id: "wheel-reference", nodeId: "wheel-image", kind: "image", label: "图片1", title: "Fixture reference", active: true, previewUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" };
    const render = async (id = "wheel-panel", scale = 1) => act(async () => root.render(
        <div>
            <CanvasViewport containerRef={containerRef} viewport={{ x: 0, y: 0, k: scale }}
                onViewportChange={(next) => commits.push(next)} onViewportPreviewChange={(next) => previews.push(next)}>
                <div data-background>Canvas background</div>
            </CanvasViewport>
            <CanvasNodePanelOverlay containerRef={containerRef} viewport={{ x: 0, y: 0, k: scale }}
                node={{ id, type: CanvasNodeType.Image, title: "Fixture image", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: {} }}>
                <CanvasResourceMentionTextarea aria-label="Image prompt" value={rich ? "@图片1 prompt" : "plain prompt"}
                    references={rich ? [reference] : []} onChange={(value) => { changes.push(value); }} />
            </CanvasNodePanelOverlay>
        </div>,
    ));
    await render();
    const panel = host.querySelector<HTMLElement>("[data-canvas-node-panel]")!;
    const editor = panel.querySelector<HTMLElement>(rich ? '[contenteditable="true"]' : "textarea")!;
    expect(Boolean(editor)).toBe(true);
    expect(containerRef.current!.contains(panel)).toBe(false);
    expect(panel.parentElement === containerRef.current!.parentElement).toBe(true);
    let scrollTop = 10;
    // HappyDOM has no scroll layout; model a textarea boundary so the real plain handler cannot scroll further.
    if (!rich) Object.defineProperty(editor, "scrollTop", { configurable: true, get: () => scrollTop, set: (next) => { scrollTop = Math.max(0, Math.min(10, next)); } });
    const target = rich ? editor.querySelector<HTMLElement>("span")! : editor;
    expect(Boolean(target)).toBe(true);
    const dispatch = async (element: Element, init: WheelEventInit) => {
        const event = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100, ...init });
        // HappyDOM WheelEvent omits MouseEvent flags; these fields model the supplied DOM event contract.
        Object.defineProperties(event, { ctrlKey: { value: init.ctrlKey ?? false }, metaKey: { value: init.metaKey ?? false }, shiftKey: { value: init.shiftKey ?? false } });
        await act(async () => { element.dispatchEvent(event); });
        return event;
    };
    const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
    const expectCanvasIdle = () => { expect(previews).toHaveLength(0); expect(commits).toHaveLength(0); expect(changes).toHaveLength(0); };
    const cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
    return { panel, editor, target, dispatch, render, settle, expectCanvasIdle, previews, commits, cleanup, background: host.querySelector<HTMLElement>("[data-background]")!, resetScroll: () => { scrollTop = 0; } };
}

for (const rich of [false, true]) {
    const branch = rich ? "real image-reference contenteditable descendant" : "real plain textarea at scroll boundary";
    for (const [gesture, flags] of [
        ["Control wheel", { ctrlKey: true }], ["Meta wheel", { metaKey: true }], ["Chromium pinch-shaped wheel", { ctrlKey: true, deltaY: 2.5 }],
    ] as Array<[string, WheelEventInit]>) {
        test(`${branch}: sibling overlay cancels ${gesture} page zoom without touching the canvas`, async () => {
            const f = await fixture(rich);
            try {
                const event = await f.dispatch(f.target, flags);
                await f.settle();
                expect(event.defaultPrevented).toBe(true);
                f.expectCanvasIdle();
            } finally { await f.cleanup(); }
        });
    }
    test(`${branch}: ordinary vertical wheel retains its original scrolling contract`, async () => {
        const f = await fixture(rich);
        try {
            const atBoundary = await f.dispatch(f.target, {});
            expect(atBoundary.defaultPrevented).toBe(false);
            if (!rich) {
                f.resetScroll();
                const scrollable = await f.dispatch(f.editor, {});
                expect(f.editor.scrollTop).toBe(10);
                expect(scrollable.defaultPrevented).toBe(true);
            }
            await f.settle(); f.expectCanvasIdle();
        } finally { await f.cleanup(); }
    });
}

test("overlay wheel capture cancels default before the rich descendant can stop propagation", async () => {
    const f = await fixture(true);
    try {
        let targetCalls = 0;
        let preventedAtTarget = false;
        f.target.addEventListener("wheel", (event) => { targetCalls++; preventedAtTarget = event.defaultPrevented; event.stopPropagation(); });
        await f.dispatch(f.target, { ctrlKey: true, deltaY: 2.5 });
        expect(targetCalls).toBe(1); expect(preventedAtTarget).toBe(true);
        await f.settle(); f.expectCanvasIdle();
    } finally { await f.cleanup(); }
});

test("overlay listener survives node/viewport prop changes and is removed from its DOM node on unmount", async () => {
    const f = await fixture(true);
    try {
        await f.render("another-fixture-node", 0.8);
        const event = await f.dispatch(f.target, { metaKey: true });
        expect(event.defaultPrevented).toBe(true);
        await f.settle(); f.expectCanvasIdle();
    } finally { await f.cleanup(); }
    const detachedEvent = await f.dispatch(f.target, { ctrlKey: true });
    expect(detachedEvent.defaultPrevented).toBe(false);
});

test("the sibling panel does not globally intercept background canvas zoom", async () => {
    const f = await fixture(true);
    try {
        const event = await f.dispatch(f.background, { ctrlKey: true, deltaY: 2.5 });
        await f.settle();
        expect(event.defaultPrevented).toBe(true);
        expect(f.previews).toHaveLength(1); expect(f.previews[0].k).toBeLessThan(1);
        expect(f.commits).toEqual(f.previews);
    } finally { await f.cleanup(); }
});
