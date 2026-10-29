import { afterEach, beforeEach, expect, test } from "bun:test";
import { bindCanvasVideoHoverPreview, VIDEO_HOVER_DELAY_MS } from "../src/lib/canvas/canvas-video-hover-preview";

const wait = (ms = VIDEO_HOVER_DELAY_MS + 30) => new Promise((resolve) => setTimeout(resolve, ms));
const originals = new Map<string, PropertyDescriptor | undefined>();
let videos: FakeVideo[];
let reduced = false;
let interacting = false;
let mutation: () => void;
let visibility: (entries: { isIntersecting: boolean }[]) => void;
const cleanups: (() => void)[] = [];
let frameCallbacks = true;
let animationFrames: Map<number, FrameRequestCallback>;
let nextAnimationFrame = 0;
function renderFrame() {
    const callbacks = [...animationFrames.values()];
    animationFrames.clear();
    callbacks.forEach((callback) => callback(0));
}
class FakeVideo extends EventTarget {
    paused = true; currentTime = 0; src = ""; muted = false; playsInline = false; preload = "";
    className = ""; dataset: Record<string, string> = {}; removed = false; loads = 0;
    style = { opacity: "" }; readyState = 0;
    frameCallback?: () => void;
    cancelledFrames: number[] = [];
    releaseWasDetached = false;
    requestVideoFrameCallback: ((callback: () => void) => number) | undefined = frameCallbacks
        ? (callback) => { this.frameCallback = callback; return 0; } : undefined;
    cancelVideoFrameCallback(id: number) { this.cancelledFrames.push(id); this.frameCallback = undefined; }
    setAttribute() {}
    removeAttribute() { this.releaseWasDetached = this.removed; this.src = ""; }
    load() { this.loads++; }
    remove() { this.removed = true; }
    pause() { this.paused = true; }
    async play() { this.paused = false; this.dispatchEvent(new Event("playing")); }
}
class FakeElement extends EventTarget {
    isConnected = true; dataset: Record<string, string> = {};
    closest(selector: string) { return selector.includes('="true"') ? (interacting ? this : null) : this; }
    getAttribute() { return interacting ? "true" : null; }
    appendChild(video: FakeVideo) { videos.push(video); }
}
function stub(key: string, value: unknown) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
function setup(resolve: () => Promise<string> = async () => "test.mp4") {
    const element = new FakeElement();
    cleanups.push(bindCanvasVideoHoverPreview(element as unknown as HTMLElement, resolve));
    return element;
}
function enter(element: FakeElement, pointerType = "mouse", buttons = 0) {
    element.dispatchEvent(Object.assign(new Event("pointerenter"), { pointerType, buttons }));
}
beforeEach(() => {
    videos = []; reduced = false; interacting = false;
    frameCallbacks = true; animationFrames = new Map(); nextAnimationFrame = 0;
    stub("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = nextAnimationFrame++; animationFrames.set(id, callback); return id; });
    stub("cancelAnimationFrame", (id: number) => animationFrames.delete(id));
    stub("window", Object.assign(new EventTarget(), { matchMedia: () => ({ matches: reduced }) }));
    stub("document", Object.assign(new EventTarget(), { hidden: false, querySelectorAll: () => videos.filter((v) => !v.removed), createElement: () => new FakeVideo() }));
    stub("MutationObserver", class { constructor(callback: () => void) { mutation = callback; } observe() {} disconnect() {} });
    stub("IntersectionObserver", class { constructor(callback: typeof visibility) { visibility = callback; } observe() {} disconnect() {} });
});
afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
    originals.clear();
});

test("quick pass, touch, dragging and reduced motion never resolve media", async () => {
    let calls = 0;
    const element = setup(async () => { calls++; return "test.mp4"; });
    enter(element); element.dispatchEvent(new Event("pointerleave"));
    enter(element, "touch"); enter(element, "mouse", 1);
    reduced = true; enter(element);
    await wait();
    expect(calls).toBe(0);
});
test("hover plays beyond three seconds and restores the button on completion", async () => {
    const element = setup(); enter(element); await wait();
    const video = videos[0];
    expect(video.muted).toBe(true); expect(video.playsInline).toBe(true);
    video.frameCallback!(); expect(element.dataset.hoverPlaying).toBe("true");
    video.currentTime = 12; video.dispatchEvent(new Event("timeupdate"));
    expect(video.paused).toBe(false); expect(video.removed).toBe(false);
    video.dispatchEvent(new Event("ended"));
    expect(element.dataset.hoverPlaying).toBeUndefined();
    expect(video.removed).toBe(true);
});
test("a brief departure resumes, a long departure restarts, and ending clears the position", async () => {
    const element = setup(); enter(element); await wait();
    videos[0].currentTime = 9;
    element.dispatchEvent(new Event("pointerleave"));
    enter(element); await wait();
    videos[1].dispatchEvent(new Event("loadedmetadata"));
    expect(videos[1].currentTime).toBe(9);
    videos[1].frameCallback!(); expect(element.dataset.hoverPlaying).toBeUndefined();
    videos[1].dispatchEvent(new Event("seeked")); videos[1].frameCallback!();
    expect(element.dataset.hoverPlaying).toBe("true");
    element.dispatchEvent(new Event("pointerleave"));
    const now = Date.now;
    Date.now = () => now() + 6000;
    try { enter(element); await wait(); } finally { Date.now = now; }
    videos[2].dispatchEvent(new Event("loadedmetadata")); expect(videos[2].currentTime).toBe(0);
    videos[2].currentTime = 20; videos[2].dispatchEvent(new Event("ended"));
    enter(element); await wait(); videos[3].dispatchEvent(new Event("loadedmetadata"));
    expect(videos[3].currentTime).toBe(0);
});
test("new hover cancels previous decoder and ignores stale URL resolution", async () => {
    let resolve!: (value: string) => void;
    const slow = setup(() => new Promise<string>((done) => { resolve = done; }));
    enter(slow); await wait();
    const next = setup(); enter(next); resolve("stale.mp4"); await wait();
    expect(videos.length).toBe(1); expect(videos[0].src).toBe("test.mp4");
    enter(slow); expect(videos[0].removed).toBe(true);
});
test("wheel, viewport interaction and leaving viewport cancel playback", async () => {
    const element = setup(); enter(element); await wait();
    window.dispatchEvent(new Event("wheel")); expect(videos[0].removed).toBe(true);
    enter(element); await wait(); interacting = true; mutation(); expect(videos[1].removed).toBe(true);
    interacting = false; enter(element); await wait(); visibility([{ isIntersecting: false }]); expect(videos[2].removed).toBe(true);
});
test("manual playback is never competing with hover", async () => {
    const manual = new FakeVideo(); manual.paused = false; videos.push(manual);
    let calls = 0; const element = setup(async () => { calls++; return "test.mp4"; });
    enter(element); await wait(); expect(calls).toBe(0); expect(manual.paused).toBe(false);
});

test("poster remains visible until a presented video frame, not just playback or decoded data", async () => {
    const element = setup(); enter(element); await wait();
    const video = videos[0];
    expect(video.style.opacity).toBe("0");
    video.readyState = 2; video.dispatchEvent(new Event("loadeddata"));
    renderFrame(); renderFrame();
    expect(video.style.opacity).toBe("0");
    video.frameCallback!();
    expect(video.style.opacity).toBe("1");
});

test("older browsers wait for decoded data and a paint opportunity before revealing", async () => {
    frameCallbacks = false;
    const element = setup(); enter(element); await wait();
    const video = videos[0];
    renderFrame(); renderFrame(); expect(video.style.opacity).toBe("0");
    video.readyState = 1; video.dispatchEvent(new Event("loadeddata"));
    renderFrame(); renderFrame(); expect(video.style.opacity).toBe("0");
    video.readyState = 2; video.dispatchEvent(new Event("loadeddata"));
    video.dispatchEvent(new Event("playing"));
    renderFrame(); expect(video.style.opacity).toBe("0");
    renderFrame(); expect(video.style.opacity).toBe("1");
});

test("fallback accepts already decoded data on playback but does not reveal a lost frame", async () => {
    frameCallbacks = false;
    const element = setup(); enter(element); await wait();
    const video = videos[0];
    video.readyState = 2; video.dispatchEvent(new Event("playing"));
    renderFrame(); video.readyState = 1; renderFrame();
    expect(video.style.opacity).toBe("0");
    video.readyState = 2; video.dispatchEvent(new Event("loadeddata"));
    renderFrame(); renderFrame(); expect(video.style.opacity).toBe("1");
});

test("leave cancels frame callbacks and stale callbacks cannot reveal a reentered preview", async () => {
    const element = setup(); enter(element); await wait();
    const previous = videos[0]; const stale = previous.frameCallback!;
    element.dispatchEvent(new Event("pointerleave"));
    expect(previous.cancelledFrames).toEqual([0]);
    expect(previous.releaseWasDetached).toBe(true);
    enter(element); await wait(); stale();
    expect(previous.style.opacity).toBe("0");
    expect(videos[1].style.opacity).toBe("0");
    videos[1].frameCallback!(); expect(videos[1].style.opacity).toBe("1");
});

test("fallback leave cancels either render stage and ignores late media events", async () => {
    frameCallbacks = false;
    const element = setup();
    for (const renders of [0, 1]) {
        enter(element); await wait(); const video = videos.at(-1)!;
        video.readyState = 2; video.dispatchEvent(new Event("loadeddata"));
        if (renders) renderFrame();
        const stale = [...animationFrames.values()];
        element.dispatchEvent(new Event("pointerleave"));
        expect(animationFrames.size).toBe(0);
        stale.forEach((callback) => callback(0));
        video.dispatchEvent(new Event("loadeddata")); video.dispatchEvent(new Event("playing"));
        renderFrame(); renderFrame();
        expect(video.style.opacity).toBe("0"); expect(animationFrames.size).toBe(0);
        expect(video.releaseWasDetached).toBe(true);
    }
});

test("loading failure never covers the poster and detaches before releasing source", async () => {
    const element = setup(); enter(element); await wait(); const video = videos[0];
    const stale = video.frameCallback!;
    video.dispatchEvent(new Event("error")); stale();
    expect(video.style.opacity).toBe("0"); expect(video.removed).toBe(true);
    expect(video.releaseWasDetached).toBe(true); expect(video.src).toBe("");
});
