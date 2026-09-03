import { describe, expect, test } from "bun:test";
import { payloadToTimelineMedia, resolveTimelineMediaPayloads } from "../src/pages/canvas/use-canvas-asset-insertion";
import type { InsertAssetPayload } from "../src/components/canvas/asset-picker-modal";

function payload(kind: "video" | "audio" | "image" | "text", assetId: string): InsertAssetPayload {
    if (kind === "text") return { kind, assetId, title: "text 素材", content: "分镜文本" };
    if (kind === "image") return { kind, assetId, title: "image 素材", dataUrl: "data:image/png;base64,abc", storageKey: `resource:${assetId}` };
    return { kind, assetId, title: `${kind} 素材`, url: `https://media.example/${kind}`, storageKey: `resource:${assetId}`, durationMs: 5000, bytes: 1024, mimeType: `${kind}/test` };
}

describe("画布素材插入分流", () => {
    test("视频和音频保留可直接进入时间线的媒体信息", () => {
        expect(payloadToTimelineMedia({ ...payload("video", "video-1"), width: 1280, height: 720 })).toEqual({
            id: "video-1",
            kind: "video",
            title: "video 素材",
            storageKey: "resource:video-1",
            url: "https://media.example/video",
            width: 1280,
            height: 720,
            durationMs: 5000,
            bytes: 1024,
            mimeType: "video/test",
        });
        expect(payloadToTimelineMedia(payload("audio", "audio-1"))?.kind).toBe("audio");
    });

    test("时间线分流明确统计不支持直接入轨的素材", () => {
        const resolved = resolveTimelineMediaPayloads([payload("video", "video-1"), payload("image", "image-1"), payload("audio", "audio-1"), payload("text", "text-1")]);
        expect(resolved.media.map((item) => item.id)).toEqual(["video-1", "audio-1"]);
        expect(resolved.unsupportedCount).toBe(2);
    });
});
