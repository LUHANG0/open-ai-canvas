import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { defaultModelCapabilityConfig } from "@/lib/model-capabilities";
import { defaultConfig } from "@/stores/use-config-store";
import type { CreationAttachment } from "./creation-assets";
import { creationInputSummary, creationVideoOperationError, prepareCreationSubmission, resolvedCreationVideoOperation } from "./creation-submit-preparation";

function imageAttachment(id: string, role?: CreationAttachment["videoImageRole"]): CreationAttachment {
    return {
        id,
        name: `${id}.png`,
        type: "image/png",
        dataUrl: `data:image/png;base64,${id}`,
        previewUrl: `data:image/png;base64,${id}`,
        ...(role ? { videoImageRole: role } : {}),
    };
}

const capability = defaultModelCapabilityConfig();

describe("creation submit preparation", () => {
    test("按素材构成推断视频方式，并对首帧模式给出稳定校验", () => {
        const attachments = [imageAttachment("first", "first_frame")];
        const summary = creationInputSummary(attachments, true);

        assert.deepEqual(summary, { textCount: 1, imageCount: 1, videoCount: 0, audioCount: 0, characterCount: 0 });
        assert.equal(resolvedCreationVideoOperation("auto", summary), "image_to_video");
        assert.equal(creationVideoOperationError("image_to_video", summary, { videoStartFrameNodeId: "first", videoEndFrameNodeId: undefined }), "");
        assert.equal(creationVideoOperationError("image_to_video", summary), "首/尾帧模式必须指定首帧，尾帧可以不填");
    });

    test("视频时长不受支持时在任何消息或任务副作用前拒绝", () => {
        const result = prepareCreationSubmission({
            text: "生成视频",
            mode: "video",
            selectedModel: "video-model",
            config: defaultConfig,
            attachments: [],
            mentionReferences: [],
            referenceLimits: { maxImages: 2, maxVideos: 1, maxAudios: 1 },
            maxReferences: 4,
            modelRequirements: { capability: "video", input: creationInputSummary([], true), videoSeconds: "999" },
            videoOperationChoice: "auto",
            imageProfile: capability.image!,
            videoProfile: capability.video!,
            ratio: "16:9",
            seconds: "999",
            quality: "auto",
            videoQuality: "720",
            count: "1",
        });

        assert.deepEqual(result, { ok: false, level: "error", message: "当前模型不支持所选视频时长，请重新选择" });
    });

    test("图片请求配置和任务数量按模型能力归一化，消息设置仍保留用户选择", () => {
        const imageProfile = {
            ...capability.image!,
            size: { ...capability.image!.size, allowCustom: false },
        };
        const result = prepareCreationSubmission({
            text: "生成图片",
            mode: "image",
            selectedModel: "image-model",
            config: defaultConfig,
            attachments: [],
            mentionReferences: [],
            referenceLimits: { maxImages: imageProfile.references.maxImages, maxVideos: 0, maxAudios: 0 },
            maxReferences: imageProfile.references.maxImages,
            modelRequirements: { capability: "image", input: creationInputSummary([], true) },
            videoOperationChoice: "auto",
            imageProfile,
            videoProfile: capability.video!,
            ratio: "unsupported-ratio",
            seconds: "6",
            quality: "unsupported-quality",
            videoQuality: "720",
            count: "99",
        });

        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.requestConfig.model, "image-model");
        assert.equal(result.requestConfig.imageModel, "image-model");
        assert.equal(result.requestConfig.size, imageProfile.size.default);
        assert.equal(result.requestConfig.quality, imageProfile.quality.default);
        assert.equal(result.requestConfig.count, String(imageProfile.maxOutputs));
        assert.equal(result.imageTaskCount, imageProfile.maxOutputs);
        assert.equal(result.settings.count, "99");
    });

    test("文本引用超过总数量时保持警告级原子拒绝", () => {
        const result = prepareCreationSubmission({
            text: "分析图片",
            mode: "text",
            selectedModel: "text-model",
            config: defaultConfig,
            attachments: [imageAttachment("first"), imageAttachment("second")],
            mentionReferences: [],
            referenceLimits: { maxImages: 6, maxVideos: 6, maxAudios: 0, maxFiles: 6 },
            maxReferences: 1,
            modelRequirements: { capability: "text", input: creationInputSummary([], true) },
            videoOperationChoice: "auto",
            imageProfile: capability.image!,
            videoProfile: capability.video!,
            ratio: "1:1",
            seconds: "6",
            quality: "auto",
            videoQuality: "720",
            count: "1",
        });

        assert.deepEqual(result, { ok: false, level: "warning", message: "当前生成方式不支持部分参考内容，请移除超限素材或切换生成方式" });
    });
});
