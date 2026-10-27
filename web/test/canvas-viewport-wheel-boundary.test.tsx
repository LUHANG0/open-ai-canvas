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

async function fixture({ interactive = true, mouseWheelMode }: { interactive?: boolean; mouseWheelMode?: "zoom" | "pan" } = {}) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const containerRef = createRef<HTMLDivElement>();
    const committed: ViewportTransform[] = [];
    const previews: ViewportTransform[] = [];
    await act(async () => root.render(
        <CanvasViewport
            interactive={interactive}
            mouseWheelMode={mouseWheelMode}
            containerRef={containerRef}
            viewport={{ x: 0, y: 0, k: 1 }}
            onViewportChange={(next) => committed.push(next)}
            onViewportPreviewChange={(next) => previews.push(next)}
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
            <div data-target="selected-image" data-canvas-node data-selected="true" style={{ width: 320, height: 180 }}><img alt="Selected image" /></div>
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
            clientX: { value: init.clientX ?? 0 },
            clientY: { value: init.clientY ?? 0 },
        });
        await act(async () => { element.dispatchEvent(event); });
        return event;
    };
    const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
    const expectIdle = () => {
        expect(previews).toHaveLength(0);
        expect(committed).toHaveLength(0);
        expect(graphicsPreviews).toBe(0);
        expect(world.style.transform).toBe(initialTransform);
        expect(container.dataset.canvasViewportInteracting).toBeUndefined();
    };
    const cleanup = async () => {
        await act(async () => root.unmount()); host.remove();
        window.dispatchEvent(new window.KeyboardEvent("keyup", { key: "Control" }));
    };
    return { container, target, dispatch, settle, expectIdle, previews, committed, cleanup };
}

const protectedTargets = ["input", "textarea", "select", "editable", "editable-child", "plaintext", "no-zoom-child", "wheel-scroll-child", "overlay-child"];
const zoomGestures: Array<[string, WheelEventInit]> = [
    ["Control wheel", { ctrlKey: true, deltaY: 100 }],
    ["Meta wheel", { metaKey: true, deltaY: 100 }],
    ["Chromium pinch-shaped wheel", { ctrlKey: true, deltaY: 2.5 }],
];

for (const name of protectedTargets) {
    for (const [gesture, init] of zoomGestures) {
        test(`${name}: ${gesture} cancels page zoom without canvas preview or commit`, async () => {
            const f = await fixture();
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

test("Control keydown plus wheel over a selected image zooms the viewport without changing its size", async () => {
    const f = await fixture();
    try {
        const image = f.target("selected-image");
        const size = { width: image.style.width, height: image.style.height };
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Control" }));
        const event = await f.dispatch(image, { ctrlKey: true, deltaMode: 1, deltaY: 3 });
        await f.settle();
        expect(event.defaultPrevented).toBe(true);
        expect(f.previews).toHaveLength(1);
        expect(f.previews[0].k).toBeLessThan(1);
        expect(f.committed).toEqual(f.previews);
        expect({ width: image.style.width, height: image.style.height }).toEqual(size);
    } finally { await f.cleanup(); }
});

test("pinch-shaped Ctrl wheel without Control keydown zooms the canvas", async () => {
    const f = await fixture();
    try {
        await f.dispatch(f.target("background"), { ctrlKey: true, deltaY: 2.5 });
        await f.settle();
        expect(f.previews).toHaveLength(1);
        expect(f.previews[0].k).toBeLessThan(1);
    } finally { await f.cleanup(); }
});

test("an active text editor does not change background Control-wheel zoom behavior", async () => {
    const f = await fixture();
    try {
        f.target("input").focus();
        window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Control" }));
        await f.dispatch(f.target("background"), { ctrlKey: true });
        await f.settle();
        expect(f.previews).toHaveLength(1);
    } finally { await f.cleanup(); }
});

test("noninteractive viewport installs no canvas wheel interception", async () => {
    const f = await fixture({ interactive: false });
    try {
        const event = await f.dispatch(f.target("background"), { ctrlKey: true });
        await f.settle();
        expect(event.defaultPrevented).toBe(false);
        f.expectIdle();
    } finally { await f.cleanup(); }
});

for (const mode of ["zoom", "pan"] as const) {
    test(`${mode} preference preserves internal wheel boundaries`, async () => {
        const f = await fixture({ mouseWheelMode: mode });
        try {
            for (const name of protectedTargets) {
                expect((await f.dispatch(f.target(name), { deltaY: 100 })).defaultPrevented).toBe(false);
                for (const [, gesture] of zoomGestures) {
                    expect((await f.dispatch(f.target(name), gesture)).defaultPrevented).toBe(true);
                }
            }
            await f.settle();
            f.expectIdle();
        } finally { await f.cleanup(); }
    });

    for (const [gesture, init] of zoomGestures) {
        test(`${mode} preference keeps ${gesture} as cursor-centered zoom`, async () => {
            const f = await fixture({ mouseWheelMode: mode });
            try {
                await f.dispatch(f.target("background"), { ...init, clientX: 240, clientY: 160 });
                await f.settle();
                const next = f.previews[0]!;
                expect(next.k).toBeLessThan(1);
                expect(next.x).toBeCloseTo(240 * (1 - next.k));
                expect(next.y).toBeCloseTo(160 * (1 - next.k));
                expect(f.committed).toEqual(f.previews);
            } finally { await f.cleanup(); }
        });
    }

    for (const deltaY of [100, -120]) {
        test(`${mode} preference routes discrete wheel ${deltaY} without reversing its direction`, async () => {
            const f = await fixture({ mouseWheelMode: mode });
            try {
                expect((await f.dispatch(f.target("background"), { deltaY })).defaultPrevented).toBe(true);
                await f.settle();
                expect(f.previews).toHaveLength(1);
                if (mode === "pan") expect(f.previews[0]).toEqual({ x: 0, y: -deltaY, k: 1 });
                else expect(Math.sign(f.previews[0]!.k - 1)).toBe(-Math.sign(deltaY));
                expect(f.committed).toEqual(f.previews);
            } finally { await f.cleanup(); }
        });
    }

    for (const init of [{ deltaX: 12, deltaY: -7 }, { deltaY: 2.5 }, { shiftKey: true, deltaY: 100 }, { deltaY: 3, deltaMode: 1 }]) {
        test(`${mode} preference preserves trackpad/Shift/line gesture ${JSON.stringify(init)}`, async () => {
            const f = await fixture({ mouseWheelMode: mode });
            try {
                await f.dispatch(f.target("background"), init);
                await f.settle();
                const next = f.previews[0]!;
                if ("deltaMode" in init && mode === "zoom") expect(next.k).toBeLessThan(1);
                else {
                    expect(next.k).toBe(1);
                    expect(next.x).toBe("shiftKey" in init ? -100 : "deltaX" in init ? -12 : 0);
                    expect(next.y).toBe("shiftKey" in init ? 0 : "deltaMode" in init ? -48 : -init.deltaY);
                }
                expect(f.committed).toEqual(f.previews);
            } finally { await f.cleanup(); }
        });
    }
}

test("Mac Control-left blank drag yields to the context menu without capture or selection", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const containerRef = createRef<HTMLDivElement>();
    let selections = 0;
    let captures = 0;
    let menus = 0;
    try {
        await act(async () => root.render(
            <CanvasViewport containerRef={containerRef} viewport={{ x: 0, y: 0, k: 1 }} boxSelectEnabled onViewportChange={() => { throw new Error("Secondary click must not move the viewport"); }} onCanvasMouseDown={() => selections++} onContextMenu={() => menus++}>
                <div data-background />
            </CanvasViewport>,
        ));
        const container = containerRef.current!;
        container.setPointerCapture = () => { captures++; };
        const target = container.querySelector("[data-background]")!;
        const pointer = new window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ctrlKey: true, pointerType: "mouse", pointerId: 1 });
        await act(async () => { target.dispatchEvent(pointer); });
        expect(pointer.defaultPrevented).toBe(false);
        expect(selections).toBe(0);
        expect(captures).toBe(0);
        expect(container.dataset.canvasViewportInteracting).toBeUndefined();
        await act(async () => { target.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 0, ctrlKey: true })); });
        expect(menus).toBe(1);
    } finally {
        await act(async () => root.unmount()); host.remove();
        if (descriptor) Object.defineProperty(navigator, "platform", descriptor);
        else Reflect.deleteProperty(navigator, "platform");
    }
});
