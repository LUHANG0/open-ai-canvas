import { describe, expect, test } from "bun:test";
import { canvasImageDisplayVariant } from "../src/lib/canvas/canvas-image-display-source";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const image: CanvasNodeData = {
    id: "libtv",
    type: CanvasNodeType.Image,
    title: "图片",
    position: { x: 0, y: 0 },
    width: 480,
    height: 320,
    metadata: { content: "https://libtv-res.liblib.art/image.png", naturalWidth: 2400, naturalHeight: 1600, importSource: { provider: "libtv", projectUuid: "fixture", nodeKey: "photo", batchId: "batch" } },
};

describe("canvas display image sizing", () => {
    test("uses the confirmed 960px-wide LibTV variant through the exact DPR boundary", () => {
        expect(canvasImageDisplayVariant(image, "full", 1, 1)).toBe("thumbnail");
        expect(canvasImageDisplayVariant(image, "full", 1, 2)).toBe("thumbnail");
        expect(canvasImageDisplayVariant(image, "full", 1.001, 2)).toBe("original");
        expect(canvasImageDisplayVariant(image, "full", 2, 1)).toBe("thumbnail");
        expect(canvasImageDisplayVariant(image, "full", 2, 2)).toBe("original");
    });
    test("measures contained portrait and landscape pixels rather than the outer box", () => {
        const portrait = { ...image, width: 1000, height: 800, metadata: { ...image.metadata, naturalWidth: 1200, naturalHeight: 2400 } };
        expect(canvasImageDisplayVariant(portrait, "full", 1, 2)).toBe("thumbnail");
        expect(canvasImageDisplayVariant({ ...portrait, height: 1000 }, "full", 1, 2)).toBe("original");
        expect(canvasImageDisplayVariant({ ...portrait, metadata: { ...portrait.metadata, freeResize: true } }, "full", 1, 1)).toBe("original");
    });
    test("does not invent resized assets or trust unknown transformed or missing dimensions", () => {
        expect(canvasImageDisplayVariant({ ...image, metadata: { ...image.metadata, importSource: undefined, storageKey: "resource:ordinary" } }, "full", 1, 1)).toBe("original");
        expect(canvasImageDisplayVariant({ ...image, metadata: { ...image.metadata, naturalWidth: undefined } }, "full", 1, 1)).toBe("original");
        expect(canvasImageDisplayVariant({ ...image, metadata: { ...image.metadata, content: `${image.metadata!.content}?x-oss-process=image/resize,w_400` } }, "full", 1, 1)).toBe("original");
        expect(canvasImageDisplayVariant({ ...image, metadata: { ...image.metadata, content: "https://untrusted.example/image.png" } }, "full", 1, 1)).toBe("original");
    });
    test("small originals do not upgrade needlessly and invalid viewport data is conservative", () => {
        const small = { ...image, metadata: { ...image.metadata, naturalWidth: 320, naturalHeight: 200 } };
        expect(canvasImageDisplayVariant(small, "full", 4, 3)).toBe("original");
        expect(canvasImageDisplayVariant(image, "full", Number.NaN, 2)).toBe("original");
        expect(canvasImageDisplayVariant(image, "full", 1, 0)).toBe("original");
        expect(canvasImageDisplayVariant(image, "preview", 0.1, 2)).toBe("thumbnail");
        expect(canvasImageDisplayVariant(image, "shell", 0.01, 2)).toBe("thumbnail");
    });
});
