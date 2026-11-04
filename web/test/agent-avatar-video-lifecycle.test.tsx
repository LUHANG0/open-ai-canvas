import { expect, test } from "bun:test";
import { avatarFixture } from "./helpers/agent-avatar-video-fixture";
import { AgentAvatarVideo } from "../src/components/canvas/agent-avatar-video";

test("component keeps video identity/play position through class, loop, source and fallback transitions; unmount cancels work", async () => {
    const f = avatarFixture();
    f.video.remove();
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        window: f.dom,
        document: f.dom.document,
        navigator: f.dom.navigator,
        HTMLElement: f.dom.HTMLElement,
        HTMLMediaElement: f.dom.HTMLMediaElement,
        Element: f.dom.Element,
        Node: f.dom.Node,
        requestAnimationFrame: f.dom.requestAnimationFrame.bind(f.dom),
        cancelAnimationFrame: f.dom.cancelAnimationFrame.bind(f.dom),
        IS_REACT_ACT_ENVIRONMENT: true,
    })) {
        originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    // React DOM feature detection must initialize after this test installs its DOM globals.
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(f.host as unknown as HTMLElement);
    let errors = 0;
    const render = async (src: string, loop: boolean, className: string) => {
        await act(async () => root.render(<AgentAvatarVideo src={src} loop={loop} className={className} onError={() => errors++} />));
    };
    try {
        await render("/one.mp4", true, "first");
        const video = f.host.querySelector("video")!;
        Object.defineProperties(video, { readyState: { configurable: true, value: 4 }, videoWidth: { configurable: true, value: 640 }, videoHeight: { configurable: true, value: 480 }, currentSrc: { configurable: true, get: () => video.src } });
        await act(async () => f.tick());
        video.currentTime = 4.5;
        await render("/one.mp4", false, "second");
        expect(f.host.querySelector("video")).toBe(video);
        expect(video.currentTime).toBe(4.5);
        expect(video.loop).toBe(false);
        expect(f.host.querySelector("canvas")?.className).toBe("second");
        await act(async () => f.records[0].canvas.dispatchEvent(new f.dom.Event("webglcontextlost", { cancelable: true }) as unknown as Event));
        expect(f.host.querySelector("canvas")).toBe(f.records[1].canvas);
        expect(errors).toBe(0);
        const visible = f.host.querySelector("canvas");
        const cpu = f.records[1];
        const drawsBefore = cpu.draws;
        const late = [...f.callbacks.values()][0];
        const oldSource = video.src;
        Object.defineProperties(video, { readyState: { configurable: true, value: 1 }, currentSrc: { configurable: true, value: oldSource } });
        await render("/two.mp4", true, "third");
        expect(f.host.querySelector("canvas")).toBe(visible);
        expect(f.host.querySelector("video")).toBe(video);
        expect(video.currentTime).toBe(4.5);
        late();
        expect(f.callbacks.size).toBe(1);
        expect(cpu.draws).toBe(drawsBefore);
        await act(async () => f.tick());
        expect(cpu.draws).toBe(drawsBefore);
        const intermediate = [...f.callbacks.values()][0];
        await render("/three.mp4", false, "fourth");
        expect(f.host.querySelector("canvas")).toBe(visible);
        Object.defineProperties(video, { readyState: { configurable: true, value: 4 }, currentSrc: { configurable: true, value: new URL("/two.mp4", video.src).href } });
        intermediate();
        await act(async () => f.tick());
        expect(cpu.draws).toBe(drawsBefore);
        Object.defineProperty(video, "currentSrc", { configurable: true, value: video.src });
        await act(async () => f.tick());
        expect(cpu.draws).toBe(drawsBefore + 1);
        expect(f.host.querySelector("canvas")).toBe(visible);
        expect(f.host.querySelector("video")).toBe(video);
        expect(video.loop).toBe(false);
        Object.defineProperty(video, "readyState", { configurable: true, value: 1 });
        await render("/four.mp4", true, "fifth");
        expect(f.host.querySelector("canvas")).toBe(visible);
        await act(async () => video.dispatchEvent(new f.dom.Event("error")));
        expect(errors).toBe(1);
        await act(async () => root.unmount());
        expect(f.callbacks.size).toBe(0);
        expect(f.host.querySelector("canvas")).toBeNull();
    } finally {
        await act(async () => root.unmount());
        for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
        f.close();
    }
});
