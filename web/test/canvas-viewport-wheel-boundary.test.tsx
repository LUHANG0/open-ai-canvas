import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { ViewportTransform } from "@/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
    Event: dom.Event, CustomEvent: dom.CustomEvent, ResizeObserver: dom.ResizeObserver,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

// Isolate theme persistence only; viewport handlers, scheduling and live DOM updates are real.
mock.module("@/stores/canvas/use-canvas-theme-store", () => ({ useActiveTheme: () => "light" }));
const { act, createRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasViewport } = await import("@/components/canvas/canvas-viewport");

afterAll(async () => {
    await dom.happyDOM.abort();
    mock.restore();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture({ interactive = true, resizeSelected = false } = {}) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const containerRef = createRef<HTMLDivElement>();
    const committed: ViewportTransform[] = [];
    const previews: ViewportTransform[] = [];
    const selectedDeltas: number[] = [];
    await act(async () => root.render(
        <CanvasViewport
            interactive={interactive}
            containerRef={containerRef}
            viewport={{ x: 0, y: 0, k: 1 }}
            onViewportChange={(next) => committed.push(next)}
            onViewportPreviewChange={(next) => previews.push(next)}
            onSelectedImageWheel={(delta) => { selectedDeltas.push(delta); return resizeSelected; }}
        >
            <input data-target="input" aria-label="Node title" />
            <textarea data-target="textarea" aria-label="Generation prompt" />
            <select data-target="select" aria-label="Parameter"><option>Default</option></select>
            <div contentEditable suppressContentEditableWarning data-target="editable">
                <span data-target="editable-child">Prompt reference</span>
            </div>
            <div contentEditable="plaintext-only" data-target="plaintext" />
            <div data-canvas-no-zoom><span data-target="no-zoom-child">Prompt editor shell</span></div>
            <div data-canvas-wheel-scroll><span data-target="wheel-scroll-child">Internal scroller</span></div>
            <div className="ant-popover"><span data-target="overlay-child">Popover control</span></div>
            <div data-target="background">Canvas background</div>
        </CanvasViewport>,
    ));
    const container = containerRef.current!;
    const world = container.querySelector<HTMLElement>("[data-canvas-world-layer]")!;
    const initialTransform = world.style.transform;
    let graphicsPreviews = 0;
    container.addEventListener("canvas:graphics-viewport-preview", () => graphicsPreviews++);
    const target = (name: string) => container.querySelector<HTMLElement>(`[data-target="${name}"]`)!;
    const dispatch = async (element: Element, init: WheelEventInit = {}) => {
        // Synthetic DOM events exercise the real native capture listener, not hardware gestures.
        const event = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100, ...init });
        // HappyDOM's WheelEvent omits MouseEvent modifier fields; supply the event flags explicitly.
        Object.defineProperties(event, {
            ctrlKey: { value: init.ctrlKey ?? false },
            metaKey: { value: init.metaKey ?? false },
            shiftKey: { value: init.shiftKey ?? false },
        });
        await act(async () => { element.dispatchEvent(event); });
        return event;
    };
    const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
    const expectIdle = () => {
        expect(previews).toHaveLength(0);
        expect(committed).toHaveLength(0);
        expect(selectedDeltas).toHaveLength(0);
        expect(graphicsPreviews).toBe(0);
        expect(world.style.transform).toBe(initialTransform);
        expect(container.dataset.canvasViewportInteracting).toBeUndefined();
    };
    const cleanup = async () => {
        await act(async () => root.unmount()); host.remove();
        window.dispatchEvent(new window.KeyboardEvent("keyup", { key: "Control" }));
    };
    return { container, target, dispatch, settle, expectIdle, previews, committed, selectedDeltas, cleanup };
}

const protectedTargets = ["input", "textarea", "select", "editable", "editable-child", "plaintext", "no-zoom-child", "wheel-scroll-child", "overlay-child"];
const zoomGestures: Array<[string, WheelEventInit]> = [
    ["Control wheel", { ctrlKey: true, deltaY: 100 }],
    ["Meta wheel", { metaKey: true, deltaY: 100 }],
    ["Chromium pinch-shaped wheel", { ctrlKey: true, deltaY: 2.5 }],
];

for (const name of protectedTargets) {
    for (const [gesture, init] of zoomGestures) {
        test(`${name}: ${gesture} cancels page zoom without canvas preview, commit or selected-image resize`, async () => {
            const f = await fixture({ resizeSelected: true });
            try {
                window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Control" }));
                const event = await f.dispatch(f.target(name), init);
                await f.settle();
                expect(event.defaultPrevented).toBe(true);
                f.expectIdle();
            } finally { await f.cleanup(); }
        });
    }

    test(`${name}: ordinary vertical wheel stays available to the internal control`, async () => {
        const f = await fixture();
        try {
            const event = await f.dispatch(f.target(name), { deltaY: 100 });
            await f.settle();
            expect(event.defaultPrevented).toBe(false);
            f.expectIdle();
        } finally { await f.cleanup(); }
    });
}

test("internal horizontal and Shift wheels keep the browser-history prevention boundary", async () => {
    const f = await fixture();
    try {
        for (const init of [{ deltaX: 40, deltaY: 1 }, { shiftKey: true, deltaY: 100 }]) {
            const event = await f.dispatch(f.target("wheel-scroll-child"), init);
            expect(event.defaultPrevented).toBe(true);
        }
        await f.settle();
        f.expectIdle();
    } finally { await f.cleanup(); }
});

test("a nested target's stopPropagation is too late for capture, so the viewport itself must honor the boundary", async () => {
    const f = await fixture();
    try {
        let targetCalls = 0;
        let previewsAtTarget = -1;
        let preventedAtTarget = false;
        f.target("editable-child").addEventListener("wheel", (event) => {
            targetCalls++;
            previewsAtTarget = f.previews.length;
            preventedAtTarget = event.defaultPrevented;
            event.stopPropagation();
        });
        await f.dispatch(f.target("editable-child"), { ctrlKey: true, deltaY: 2.5 });
        await f.settle();
        expect(targetCalls).toBe(1);
        expect(preventedAtTarget).toBe(true);
        expect(previewsAtTarget).toBe(0);
        f.expectIdle();
    } finally { await f.cleanup(); }
});

for (const [gesture, init] of [["discrete wheel", { deltaY: 100 }], ...zoomGestures] as Array<[string, WheelEventInit]>) {
    test(`background ${gesture} still zooms and commits the real viewport`, async () => {
        const f = await fixture();
        try {
            const event = await f.dispatch(f.target("background"), init);
            await f.settle();
            expect(event.defaultPrevented).toBe(true);
            expect(f.previews).toHaveLength(1);
            expect(f.previews[0].k).toBeLessThan(1);
            expect(f.committed).toEqual(f.previews);
            expect(f.selectedDeltas).toHaveLength(0);
        } finally { await f.cleanup(); }
    });
}

for (const [gesture, init] of [
    ["trackpad pan", { deltaX: 12, deltaY: 7 }],
    ["Shift horizontal pan", { shiftKey: true, deltaY: 100 }],
] as Array<[string, WheelEventInit]>) {
    test(`background ${gesture} still pans without changing scale`, async () => {
        const f = await fixture();
        try {
            const event = await f.dispatch(f.target("background"), init);
            await f.settle();
            expect(event.defaultPrevented).toBe(true);
            expect(f.previews).toHaveLength(1);
            expect(f.previews[0].k).toBe(1);
            expect(f.previews[0].x).toBeLessThan(0);
            expect(f.committed).toEqual(f.previews);
        } finally { await f.cleanup(); }
    });
}

test("Control keydown plus background wheel still resizes the selected image, without viewport changes", async () => {
    const f = await fixture({ resizeSelected: true });
    try {
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Control" }));
        const event = await f.dispatch(f.target("background"), { ctrlKey: true, deltaMode: 1, deltaY: 3 });
        await f.settle();
        expect(event.defaultPrevented).toBe(true);
        expect(f.selectedDeltas).toEqual([48]);
        expect(f.previews).toHaveLength(0);
        expect(f.committed).toHaveLength(0);
    } finally { await f.cleanup(); }
});

test("pinch-shaped Ctrl wheel without Control keydown never enters selected-image resizing", async () => {
    const f = await fixture({ resizeSelected: true });
    try {
        await f.dispatch(f.target("background"), { ctrlKey: true, deltaY: 2.5 });
        await f.settle();
        expect(f.selectedDeltas).toHaveLength(0);
        expect(f.previews).toHaveLength(1);
        expect(f.previews[0].k).toBeLessThan(1);
    } finally { await f.cleanup(); }
});

test("an active text editor still suppresses selected-image Control-wheel resizing on the background", async () => {
    const f = await fixture({ resizeSelected: true });
    try {
        f.target("input").focus();
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Control" }));
        await f.dispatch(f.target("background"), { ctrlKey: true });
        await f.settle();
        expect(f.selectedDeltas).toHaveLength(0);
        expect(f.previews).toHaveLength(1);
    } finally { await f.cleanup(); }
});

test("noninteractive viewport installs no canvas wheel interception", async () => {
    const f = await fixture({ interactive: false, resizeSelected: true });
    try {
        const event = await f.dispatch(f.target("background"), { ctrlKey: true });
        await f.settle();
        expect(event.defaultPrevented).toBe(false);
        f.expectIdle();
    } finally { await f.cleanup(); }
});
