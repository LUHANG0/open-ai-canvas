import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { CanvasPlaybackController } from "../src/lib/canvas/canvas-playback";
import { bindCanvasVideoHover } from "../src/lib/canvas/canvas-video-hover";
import { claimMediaPlayback, releaseMediaPlayback } from "../src/lib/canvas/media-playback-focus";

const cleanups: Array<() => void> = [];
afterEach(() =>
    cleanups
        .splice(0)
        .reverse()
        .forEach((cleanup) => cleanup()),
);
const dwell = () => new Promise((resolve) => setTimeout(resolve, 390));
function fixture() {
    const dom = new Window({ url: "http://localhost/" });
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: dom, MutationObserver: dom.MutationObserver, IntersectionObserver: undefined })) {
        originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const viewport = dom.document.createElement("div");
    viewport.dataset.canvasViewport = "";
    const box = dom.document.createElement("div");
    viewport.append(box);
    dom.document.body.append(viewport);
    let hit: Element | null = box as unknown as Element;
    Object.defineProperty(dom.document, "elementFromPoint", { configurable: true, value: () => hit });
    const controller = new CanvasPlaybackController();
    const dispose = bindCanvasVideoHover(box as unknown as HTMLElement, controller, "b", "asset:b");
    cleanups.push(() => {
        dispose();
        controller.clear();
        dom.happyDOM.abort();
        for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    });
    const pointer = (type: string, buttons = 0, pointerType = "mouse") => box.dispatchEvent(new dom.PointerEvent(type, { pointerType, buttons, clientX: 20, clientY: 20 }));
    return {
        dom,
        viewport,
        controller,
        pointer,
        dispose,
        hit: (target: Element | null) => {
            hit = target;
        },
    };
}

test("hover starts once and a blocked play is not retried on every mouse move", async () => {
    const f = fixture();
    f.pointer("pointerenter");
    await dwell();
    const token = f.controller.getSnapshot()!.token;
    f.controller.rejected(token, new DOMException("Gesture required", "NotAllowedError"));
    f.controller.rejected(token, new DOMException("Muted attempt also blocked", "NotAllowedError"));
    f.pointer("pointermove");
    await dwell();
    expect(f.controller.getSnapshot()?.token).toBe(token);
    expect(f.controller.getSnapshot()?.status).toBe("blocked");
    f.pointer("pointerleave");
    expect(f.controller.getSnapshot()).toBeNull();
});

test("entering during zoom waits, then starts without leaving the node", async () => {
    const f = fixture();
    f.viewport.dataset.canvasViewportInteracting = "true";
    f.pointer("pointerenter");
    await dwell();
    expect(f.controller.getSnapshot()).toBeNull();
    delete f.viewport.dataset.canvasViewportInteracting;
    await dwell();
    expect(f.controller.getSnapshot()?.nodeId).toBe("b");
});

test("zoom suspension resumes only if the stationary pointer still hits this node", async () => {
    const f = fixture();
    f.pointer("pointerenter");
    await dwell();
    const first = f.controller.getSnapshot()!.token;
    f.viewport.dataset.canvasViewportInteracting = "true";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.controller.getSnapshot()).toBeNull();
    delete f.viewport.dataset.canvasViewportInteracting;
    await dwell();
    expect(f.controller.getSnapshot()!.token).toBeGreaterThan(first);
    f.viewport.dataset.canvasViewportInteracting = "true";
    await new Promise((resolve) => setTimeout(resolve, 0));
    f.hit(f.dom.document.body as unknown as Element);
    delete f.viewport.dataset.canvasViewportInteracting;
    await dwell();
    expect(f.controller.getSnapshot()).toBeNull();
});

test("pointer movement recovers a missed enter; button release rearms a pending hover", async () => {
    const f = fixture();
    f.pointer("pointermove");
    f.pointer("pointerdown", 1);
    await dwell();
    expect(f.controller.getSnapshot()).toBeNull();
    f.pointer("pointerup");
    await dwell();
    expect(f.controller.getSnapshot()?.nodeId).toBe("b");
});

test("another explicit player blocks hover only until it pauses", async () => {
    const f = fixture();
    f.controller.play("a", "asset:a");
    f.pointer("pointerenter");
    await dwell();
    expect(f.controller.getSnapshot()?.nodeId).toBe("a");
    f.controller.pause();
    await dwell();
    expect(f.controller.getSnapshot()?.nodeId).toBe("b");
});

test("hover end does not loop while the pointer stays inside; a new visit can replay", async () => {
    const f = fixture();
    f.pointer("pointerenter");
    await dwell();
    f.controller.ended(f.controller.getSnapshot()!.token);
    f.pointer("pointermove");
    await dwell();
    expect(f.controller.getSnapshot()).toBeNull();
    f.pointer("pointerleave");
    f.pointer("pointerenter");
    await dwell();
    expect(f.controller.getSnapshot()?.nodeId).toBe("b");
});

test("blur cancels a pending visit; a real move can rearm and disposal removes listeners", async () => {
    const f = fixture();
    f.pointer("pointerenter");
    f.dom.dispatchEvent(new f.dom.Event("blur"));
    await dwell();
    expect(f.controller.getSnapshot()).toBeNull();
    f.pointer("pointermove");
    await dwell();
    expect(f.controller.getSnapshot()?.nodeId).toBe("b");
    f.dispose();
    f.pointer("pointermove");
    await dwell();
    expect(f.controller.getSnapshot()).toBeNull();
});

test("view availability notifies a waiting hover and touch never starts preview", async () => {
    const f = fixture();
    f.pointer("pointerenter", 0, "touch");
    await dwell();
    expect(f.controller.getSnapshot()).toBeNull();
    f.controller.setAvailable(false);
    f.pointer("pointerenter");
    await dwell();
    expect(f.controller.getSnapshot()).toBeNull();
    f.controller.setAvailable(true);
    await dwell();
    expect(f.controller.getSnapshot()?.nodeId).toBe("b");
});

test("external audio or dialog focus release wakes an eligible stationary hover", async () => {
    const f = fixture();
    const external = {};
    try {
        claimMediaPlayback(external, "explicit", () => {});
        f.pointer("pointerenter");
        await dwell();
        expect(f.controller.getSnapshot()).toBeNull();
        releaseMediaPlayback(external);
        await dwell();
        expect(f.controller.getSnapshot()?.nodeId).toBe("b");
    } finally {
        releaseMediaPlayback(external);
    }
});
