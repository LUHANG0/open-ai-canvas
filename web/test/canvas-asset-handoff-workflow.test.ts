import { describe, expect, test } from "bun:test";
import { buildCanvasAssetHandoffKey } from "../src/pages/canvas/use-canvas-asset-handoff";
import type { Asset } from "../src/stores/use-asset-store";

function asset(id: string, kind: Asset["kind"]): Asset {
    const base = { id, kind, title: id, coverUrl: "", tags: [], createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" };
    if (kind === "text") return { ...base, kind, data: { content: "text" } };
    if (kind === "image") return { ...base, kind, data: { dataUrl: "data:image/png;base64,abc", width: 1, height: 1, bytes: 1, mimeType: "image/png" } };
    if (kind === "video") return { ...base, kind, data: { url: "https://media.example/video.mp4", width: 1280, height: 720, bytes: 1, mimeType: "video/mp4" } };
    if (kind === "audio") return { ...base, kind, data: { url: "https://media.example/audio.mp3", bytes: 1, mimeType: "audio/mpeg" } };
    if (kind === "model") return { ...base, kind, data: { url: "https://media.example/model.glb", bytes: 1, mimeType: "model/gltf-binary", fileName: "model.glb" } };
    return { ...base, kind: "entity", data: { definition: {} } };
}

describe("画布素材交接副作用", () => {
    test("交接键同时包含项目、素材顺序和当前就绪类型", () => {
        const assets = [asset("video-1", "video"), asset("image-1", "image")];
        expect(buildCanvasAssetHandoffKey("canvas-1", ["video-1", "missing", "image-1"], assets)).toBe("canvas-1:video-1:video|missing:missing|image-1:image");
        expect(buildCanvasAssetHandoffKey("canvas-2", ["video-1"], assets)).not.toBe(buildCanvasAssetHandoffKey("canvas-1", ["video-1"], assets));
    });
});
