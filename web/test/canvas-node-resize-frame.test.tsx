import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useState } from "react";
import { CanvasNodeType, type CanvasNodeData, type Position } from "@/types/canvas";
import { useCanvasNodeResize } from "@/components/canvas/use-canvas-node-resize";
import type { NodeResizeCorner } from "@/lib/canvas/node-resize-geometry";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// Exercise the DOM initialization boundary: react-dom must detect the installed HappyDOM globals on first load.
const { createRoot } = await import("react-dom/client");
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
dom.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
dom.cancelAnimationFrame = id => { frames.delete(id); };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); frames.clear(); });
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
async function frame() {
    const pending = [...frames.values()]; frames.clear();
    await act(async () => { for (const callback of pending) callback(16); });
}
type Geometry = { id: string; width: number; height: number; position?: Position };
async function fixture(corner: NodeResizeCorner = "bottom-right", metadata = { freeResize: true }) {
    const initial: CanvasNodeData = { id: "resize", type: CanvasNodeType.Image, title: "Resize", position: { x: 40, y: 60 }, width: 600, height: 400, metadata };
    let input = initial;
    let readOnly = false;
    const calls: Geometry[] = [];
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    let parentDowns = 0;
    function Harness() {
        const [node, setNode] = useState(initial);
        const resize = useCanvasNodeResize({ ...node, id: input.id, metadata: input.metadata }, 0.5, null, (id, width, height, position) => {
            calls.push({ id, width, height, position });
            setNode(current => ({ ...current, width, height, position: position!, metadata: { ...current.metadata, manualSize: true } }));
        }, readOnly);
        return <div onPointerDown={() => parentDowns++}><button onPointerDown={event => resize(event, corner)}>{node.width}x{node.height}:{String(node.metadata?.manualSize)}</button></div>;
    }
    const render = async () => { await act(async () => { root.render(<Harness />); }); };
    await render();
    const target = host.querySelector("button")!;
    const captured = new Set<number>();
    target.setPointerCapture = id => { captured.add(id); };
    target.hasPointerCapture = id => captured.has(id);
    target.releasePointerCapture = id => { captured.delete(id); };
    const pointer = (type: string, x = 100, y = 100, pointerId = 7) => {
        const event = new dom.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId, clientX: x, clientY: y });
        target.dispatchEvent(event as unknown as Event);
        return event;
    };
    let mounted = true;
    const unmount = async () => { if (mounted) { mounted = false; await act(async () => root.unmount()); } };
    cleanups.push(async () => { await unmount(); host.remove(); });
    return { calls, target, captured, pointer, unmount, parentDowns: () => parentDowns, update: async (kind: string) => {
        if (kind === "replacement") input = { ...input, id: "replacement" };
        if (kind === "locked") input = { ...input, metadata: { ...input.metadata, locked: true } };
        if (kind === "readOnly") readOnly = true;
        await render();
    } };
}

test("240 native moves deliver only the latest geometry per browser frame, using the gesture snapshot", async () => {
    const f = await fixture();
    const start = f.pointer("pointerdown");
    expect(start.defaultPrevented).toBe(true);
    expect(f.parentDowns()).toBe(0);
    expect(f.target.textContent).toBe("600x400:undefined");
    expect(f.captured.has(7)).toBe(true);
    await act(async () => { for (let i = 1; i <= 240; i++) f.pointer("pointermove", 100 + i, 100 + i / 2); });
    expect(f.calls).toEqual([]);
    expect(frames.size).toBe(1);
    await frame();
    expect(f.calls).toEqual([{ id: "resize", width: 1080, height: 640, position: { x: 40, y: 60 } }]);
    expect(f.target.textContent).toBe("1080x640:true");
    await act(async () => { f.pointer("pointermove", 110, 105); f.pointer("pointermove", 120, 110); });
    await frame();
    expect(f.calls.at(-1)).toEqual({ id: "resize", width: 640, height: 420, position: { x: 40, y: 60 } });
    expect(f.calls).toHaveLength(2);
});

for (const sameAsPending of [false, true]) test(`pointerup synchronously flushes exact final coordinates (same pending: ${sameAsPending})`, async () => {
    const f = await fixture();
    f.pointer("pointerdown");
    await act(async () => { f.pointer("pointermove", 130, 120); });
    const stale = [...frames.values()];
    await act(async () => {
        f.pointer("pointerup", sameAsPending ? 130 : 145, sameAsPending ? 120 : 125);
        expect(f.calls).toEqual([{ id: "resize", width: sameAsPending ? 660 : 690, height: sameAsPending ? 440 : 450, position: { x: 40, y: 60 } }]);
    });
    expect(frames.size).toBe(0);
    expect(f.captured.size).toBe(0);
    await act(async () => { for (const callback of stale) callback(16); f.pointer("pointermove", 500, 500); });
    await frame();
    expect(f.calls).toHaveLength(1);
});

for (const end of ["pointercancel", "lostpointercapture", "blur"]) test(`${end} preserves latest accepted move, not cancellation coordinates, and clears work`, async () => {
    const f = await fixture();
    f.pointer("pointerdown");
    await act(async () => { f.pointer("pointermove", 130, 120); });
    await act(async () => {
        if (end === "blur") dom.dispatchEvent(new dom.Event("blur"));
        else f.pointer(end, 900, 900);
    });
    expect(f.calls).toEqual([{ id: "resize", width: 660, height: 440, position: { x: 40, y: 60 } }]);
    expect(frames.size).toBe(0);
    expect(f.captured.size).toBe(0);
    await act(async () => { f.pointer("pointermove", 800, 800); f.pointer("pointerup", 800, 800); });
    await frame();
    expect(f.calls).toHaveLength(1);
    f.pointer("pointerdown");
    expect(f.captured.has(7)).toBe(true);
});

for (const kind of ["unmount", "replacement", "locked", "readOnly"]) test(`${kind} discards queued geometry and prevents stale callbacks`, async () => {
    const f = await fixture();
    f.pointer("pointerdown");
    await act(async () => { f.pointer("pointermove", 130, 120); });
    const stale = [...frames.values()];
    if (kind === "unmount") await f.unmount(); else await f.update(kind);
    expect(f.calls).toEqual([]);
    expect(frames.size).toBe(0);
    expect(f.captured.size).toBe(0);
    await act(async () => { for (const callback of stale) callback(16); f.pointer("pointerup", 500, 500); });
    await frame();
    expect(f.calls).toEqual([]);
    if (kind === "locked" || kind === "readOnly") {
        f.pointer("pointerdown");
        expect(f.captured.size).toBe(0);
    }
});

test("other pointer IDs cannot move or terminate the active gesture", async () => {
    const f = await fixture();
    f.pointer("pointerdown");
    await act(async () => { for (const type of ["pointermove", "pointerup", "pointercancel", "lostpointercapture"]) f.pointer(type, 800, 800, 8); });
    expect(f.calls).toEqual([]);
    expect(frames.size).toBe(0);
    expect(f.captured.has(7)).toBe(true);
    await act(async () => { f.pointer("pointermove", 130, 120); });
    await frame();
    expect(f.calls).toEqual([{ id: "resize", width: 660, height: 440, position: { x: 40, y: 60 } }]);
});

test("frame delivery retains aspect ratio and opposite top-left gesture anchor", async () => {
    const f = await fixture("top-left", { freeResize: false });
    f.pointer("pointerdown");
    await act(async () => { f.pointer("pointermove", 70, 90); });
    await frame();
    expect(f.calls).toEqual([{ id: "resize", width: 660, height: 440, position: { x: -20, y: 20 } }]);
});
