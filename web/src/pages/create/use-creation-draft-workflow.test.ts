import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { CreationMessage } from "./creation-types";
import { creationDraftRestorePlan, creationRetryMessagePair } from "./use-creation-draft-workflow";

function message(id: string, role: CreationMessage["role"], content: string, extra: Partial<CreationMessage> = {}): CreationMessage {
    return { id, role, content, createdAt: "2026-09-02T00:00:00.000Z", ...extra };
}

describe("creation draft workflow", () => {
    test("恢复消息草稿时复制素材和引用，并保留模型与生成参数", () => {
        const source = message("user", "user", "原始镜头", {
            mode: "video",
            model: "video-model",
            attachments: [{ id: "image", name: "image.png", type: "image/png", dataUrl: "data:image/png;base64,AA", previewUrl: "data:image/png;base64,AA" }],
            references: [{ id: "reference", nodeId: "image", title: "图片1", label: "图片1", kind: "image", active: true, attachmentId: "image" }],
            settings: { ratio: "16:9", seconds: "5", quality: "auto", videoQuality: "720", count: "1", videoOperation: "image_to_video" },
        });

        const result = creationDraftRestorePlan(source);

        assert.equal(result.mode, "video");
        assert.equal(result.prompt, "原始镜头");
        assert.equal(result.model, "video-model");
        assert.equal(result.settings?.videoOperation, "image_to_video");
        assert.deepEqual(result.attachments, source.attachments);
        assert.deepEqual(result.references, source.references);
        assert.notEqual(result.attachments, source.attachments);
        assert.notEqual(result.references, source.references);
    });

    test("从失败助手消息重试时稳定找回前一条用户消息和当前结果消息", () => {
        const user = message("user", "user", "镜头描述");
        const assistant = message("assistant", "assistant", "生成失败", { status: "error", taskIds: ["task-1"] });
        const pair = creationRetryMessagePair([user, assistant], assistant, 1);

        assert.equal(pair?.userMessage, user);
        assert.equal(pair?.assistantMessage, assistant);
    });

    test("缺少有效用户正文或结果消息时不准备重试替换", () => {
        const emptyUser = message("empty", "user", "");
        const assistant = message("assistant", "assistant", "生成失败", { status: "error" });

        assert.equal(creationRetryMessagePair([emptyUser, assistant], assistant, 1), null);
        assert.equal(creationRetryMessagePair([message("user", "user", "镜头描述")], message("user", "user", "镜头描述"), 0), null);
    });
});
