import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { CreationAttachment } from "./creation-assets";
import { creationAttachmentsForVideoOperation, creationModeModelFallback, creationModelConfigKey, creationVideoImageRoleUpdate } from "./use-creation-mode-workflow";

function imageAttachment(id: string, videoImageRole?: CreationAttachment["videoImageRole"]): CreationAttachment {
    return {
        id,
        name: `${id}.png`,
        type: "image/png",
        dataUrl: `data:image/png;base64,${id}`,
        previewUrl: `data:image/png;base64,${id}`,
        videoImageRole,
    };
}

describe("creation mode workflow", () => {
    test("创作类型只在当前模型不可选时回退到首个可用模型", () => {
        assert.equal(creationModelConfigKey("text"), "textModel");
        assert.equal(creationModelConfigKey("image"), "imageModel");
        assert.equal(creationModelConfigKey("video"), "videoModel");
        assert.equal(creationModeModelFallback("image", "image-a", ["image-a", "image-b"]), undefined);
        assert.deepEqual(creationModeModelFallback("image", "missing", ["image-a", "image-b"]), { key: "imageModel", value: "image-a" });
        assert.equal(creationModeModelFallback("video", "missing", []), undefined);
    });

    test("切换首尾帧方式会初始化帧角色，离开后清除系统帧标记", () => {
        const source = [imageAttachment("first"), imageAttachment("second")];
        const framed = creationAttachmentsForVideoOperation(source, "image_to_video", true);
        assert.equal(framed[0].videoImageRole, "first_frame");
        assert.equal(framed[1].videoImageRole, "last_frame");

        const referenced = creationAttachmentsForVideoOperation(framed, "reference_to_video", true);
        assert.equal(referenced[0].videoImageRole, undefined);
        assert.equal(referenced[1].videoImageRole, undefined);
    });

    test("手动指定首尾帧会进入首尾帧模式并保证同类角色唯一", () => {
        const source = [imageAttachment("first", "first_frame"), imageAttachment("second", "reference_image")];
        const result = creationVideoImageRoleUpdate(source, "second", "first_frame");

        assert.equal(result.videoOperationChoice, "image_to_video");
        assert.equal(result.attachments[0].videoImageRole, "reference_image");
        assert.equal(result.attachments[1].videoImageRole, "first_frame");
        assert.equal(creationVideoImageRoleUpdate(result.attachments, "second", "reference_image").videoOperationChoice, undefined);
    });
});
