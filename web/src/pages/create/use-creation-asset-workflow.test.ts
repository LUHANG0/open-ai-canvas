import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { CreationAttachment } from "./creation-assets";
import { mergeUploadedCreationAttachments } from "./use-creation-asset-workflow";

function imageAttachment(id: string): CreationAttachment {
    return {
        id,
        name: `${id}.png`,
        type: "image/png",
        dataUrl: `data:image/png;base64,${id}`,
        previewUrl: `data:image/png;base64,${id}`,
    };
}

describe("creation asset workflow", () => {
    test("合并上传结果时按稳定 ID 去重并遵守模型分类上限", () => {
        const first = imageAttachment("first");
        const result = mergeUploadedCreationAttachments({
            current: [first],
            uploaded: [first, imageAttachment("second"), imageAttachment("third")],
            mode: "image",
            referenceLimits: { maxImages: 2, maxVideos: 0, maxAudios: 0 },
            maxReferences: 2,
        });

        assert.deepEqual(result.map((item) => item.id), ["first", "second"]);
        assert.equal(result[0], first);
    });

    test("文本附件同时受分类上限与总引用数量限制", () => {
        const result = mergeUploadedCreationAttachments({
            current: [imageAttachment("first")],
            uploaded: [imageAttachment("second"), imageAttachment("third")],
            mode: "text",
            referenceLimits: { maxImages: 3, maxVideos: 3, maxAudios: 0, maxFiles: 3 },
            maxReferences: 2,
        });

        assert.deepEqual(result.map((item) => item.id), ["first", "second"]);
    });

    test("视频附件合并后再执行首尾帧角色归一化", () => {
        let normalizedIds: string[] = [];
        const result = mergeUploadedCreationAttachments({
            current: [],
            uploaded: [imageAttachment("first"), imageAttachment("last")],
            mode: "video",
            referenceLimits: { maxImages: 2, maxVideos: 1, maxAudios: 1 },
            maxReferences: 4,
            normalizeVideoAttachments: (attachments) => {
                normalizedIds = attachments.map((item) => item.id);
                return attachments.map((item, index) => ({ ...item, videoImageRole: index === 0 ? "first_frame" : "last_frame" }));
            },
        });

        assert.deepEqual(normalizedIds, ["first", "last"]);
        assert.deepEqual(result.map((item) => item.videoImageRole), ["first_frame", "last_frame"]);
    });
});
