import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { defaultModelCapabilityConfig } from "@/lib/model-capabilities";
import type { CreationAttachment } from "./creation-assets";
import { creationModelRequirements, creationReferenceImageSize, creationReferenceLimits } from "./use-creation-model-workflow";

function imageAttachment(id: string, width = 1280, height = 720): CreationAttachment {
    return {
        id,
        name: `${id}.png`,
        type: "image/png",
        dataUrl: `data:image/png;base64,${id}`,
        previewUrl: `data:image/png;base64,${id}`,
        width,
        height,
    };
}

describe("creation model workflow", () => {
    test("图片创作需求携带当前画幅、质量、数量和透明背景", () => {
        const result = creationModelRequirements({
            config: { transparentBackground: "true", videoGenerateAudio: "false", videoWatermark: "false" },
            mode: "image",
            modelInput: { textCount: 1, imageCount: 1, videoCount: 0, audioCount: 0, characterCount: 0 },
            videoOperationChoice: "auto",
            ratio: "16:9",
            seconds: "5",
            quality: "high",
            videoQuality: "720",
            count: "3",
        });

        assert.equal(result.capability, "image");
        assert.equal(result.imageSize, "16:9");
        assert.deepEqual(result.options, { size: "16:9", quality: "high", count: 3, transparentBackground: true });
        assert.equal(result.videoOperation, undefined);
    });

    test("不同视频方式得到对应的图片、视频和音频参考上限", () => {
        const profile = defaultModelCapabilityConfig();
        const common = {
            selectedModel: "video-model",
            mode: "video" as const,
            groupReferenceLimits: { maxImages: 4, maxVideos: 2, maxAudios: 3 },
            imageProfile: profile.image!,
            videoProfile: profile.video!,
        };

        assert.deepEqual(creationReferenceLimits({ ...common, videoOperationChoice: "text_to_video" }), { maxImages: 0, maxVideos: 0, maxAudios: 0, maxFiles: 0 });
        assert.deepEqual(creationReferenceLimits({ ...common, videoOperationChoice: "reference_to_video" }), { maxImages: 4, maxVideos: 2, maxAudios: 3, maxFiles: 0 });
        assert.deepEqual(creationReferenceLimits({ ...common, videoOperationChoice: "audio_to_video" }), { maxImages: 0, maxVideos: 0, maxAudios: 3, maxFiles: 0 });
    });

    test("只有单张且尺寸有效的参考图才向规格面板提供原图尺寸", () => {
        assert.deepEqual(creationReferenceImageSize([imageAttachment("single")]), { width: 1280, height: 720 });
        assert.equal(creationReferenceImageSize([imageAttachment("first"), imageAttachment("second")]), undefined);
        assert.equal(creationReferenceImageSize([imageAttachment("invalid", 0, 720)]), undefined);
    });
});
