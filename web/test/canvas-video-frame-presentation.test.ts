import { expect, test } from "bun:test";
import { revealCanvasVideoFrame } from "../src/lib/canvas/canvas-video-frame-presentation";

test("poster waits for a presented frame and late callbacks are ignored after cleanup", () => {
    let callback: () => void = () => {};
    let reveals = 0;
    let cancelled = false;
    const video = {
        readyState: 4,
        requestVideoFrameCallback: (fn: () => void) => {
            callback = fn;
            return 0;
        },
        cancelVideoFrameCallback: () => {
            cancelled = true;
        },
    } as unknown as HTMLVideoElement;
    const dispose = revealCanvasVideoFrame(video, () => reveals++);
    expect(reveals).toBe(0);
    callback();
    expect(reveals).toBe(1);
    dispose();
    callback();
    expect(reveals).toBe(1);
    expect(cancelled).toBe(true);
});
test("fallback requires decoded data and two paint opportunities, and cancels pending work", () => {
    const descriptors = [Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"), Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame")];
    let id = 0;
    const frames = new Map<number, FrameRequestCallback>();
    Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: (fn: FrameRequestCallback) => {
            frames.set(++id, fn);
            return id;
        },
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: (key: number) => frames.delete(key) });
    const flush = () => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((fn) => fn(0));
    };
    try {
        const video = Object.assign(new EventTarget(), { paused: false, readyState: 1 }) as unknown as HTMLVideoElement;
        let reveals = 0;
        const dispose = revealCanvasVideoFrame(video, () => reveals++);
        flush();
        flush();
        expect(reveals).toBe(0);
        Object.defineProperty(video, "readyState", { value: 4, configurable: true });
        video.dispatchEvent(new Event("loadeddata"));
        flush();
        expect(reveals).toBe(0);
        flush();
        expect(reveals).toBe(1);
        video.dispatchEvent(new Event("playing"));
        dispose();
        flush();
        flush();
        expect(reveals).toBe(1);
    } finally {
        ["requestAnimationFrame", "cancelAnimationFrame"].forEach((key, index) => {
            const d = descriptors[index];
            if (d) Object.defineProperty(globalThis, key, d);
            else Reflect.deleteProperty(globalThis, key);
        });
    }
});
