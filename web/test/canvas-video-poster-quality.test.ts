import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { needsCanvasVideoPosterUpgrade } from "../src/lib/canvas/canvas-video-poster-quality";
import { captureVideoPoster } from "../src/lib/video-poster";
import type { CanvasNodeData } from "../src/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
afterAll(() => {
    for (const [key, value] of originals) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key);
    dom.happyDOM.abort();
});

test("only known undersized generated posters are upgraded, without upscaling source pixels", () => {
    const node = { type: "video", metadata: { naturalWidth: 1280, naturalHeight: 720, videoPreview: { width: 400, height: 225 } } } as CanvasNodeData;
    expect(needsCanvasVideoPosterUpgrade(node)).toBe(true);
    expect(needsCanvasVideoPosterUpgrade({ ...node, metadata: { ...node.metadata, videoPreview: { width: 1280, height: 720 } } })).toBe(false);
    expect(needsCanvasVideoPosterUpgrade({ ...node, metadata: { ...node.metadata, naturalWidth: 400, naturalHeight: 225 } })).toBe(false);
    expect(needsCanvasVideoPosterUpgrade({ ...node, metadata: { videoPreview: { width: 400, height: 225 } } })).toBe(false);
    expect(needsCanvasVideoPosterUpgrade({ ...node, metadata: { previewContent: "/custom-cover.png", naturalWidth: 1280, naturalHeight: 720 } })).toBe(false);
    expect(needsCanvasVideoPosterUpgrade({ ...node, metadata: { naturalWidth: 3840, naturalHeight: 2160, videoPreview: { width: 1920, height: 1080 } } })).toBe(false);
});

test("poster capture preserves HD frames, caps portrait/4K size and uses higher JPEG quality", async () => {
    const create = dom.document.createElement.bind(dom.document);
    for (const [sourceWidth, sourceHeight, width, height] of [
        [1280, 720, 1280, 720],
        [752, 560, 752, 560],
        [3840, 2160, 1920, 1080],
        [2160, 3840, 1080, 1920],
    ]) {
        let encoded: unknown[] = [];
        dom.document.createElement = ((tag: string) => {
            const element = create(tag);
            if (tag === "video") {
                Object.defineProperties(element, {
                    videoWidth: { value: sourceWidth },
                    videoHeight: { value: sourceHeight },
                    duration: { value: 15 },
                    pause: { value: () => {} },
                    load: {
                        value: () => {
                            if (element.getAttribute("src")) queueMicrotask(() => element.dispatchEvent(new dom.Event("loadeddata")));
                        },
                    },
                });
            }
            if (tag === "canvas") {
                Object.defineProperties(element, {
                    getContext: { value: () => ({ fillRect() {}, drawImage() {} }) },
                    toBlob: {
                        value: (done: (blob: Blob) => void, mime: string, quality: number) => {
                            encoded = [(element as unknown as HTMLCanvasElement).width, (element as unknown as HTMLCanvasElement).height, mime, quality];
                            done(new Blob(["poster"]));
                        },
                    },
                });
            }
            return element;
        }) as typeof dom.document.createElement;
        const result = await captureVideoPoster("/fixture.mp4");
        expect(encoded).toEqual([width, height, "image/jpeg", 0.94]);
        expect([result.width, result.height]).toEqual([sourceWidth, sourceHeight]);
        expect(result.poster).toBeDefined();
    }
    dom.document.createElement = create;
});
