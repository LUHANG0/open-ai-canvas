import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { creationSubmissionStartGuard } from "./use-creation-submit-workflow";

const validInput = {
    prompt: "  一个电影镜头  ",
    busy: false,
    pendingUploadCount: 0,
    activeConversationAvailable: true,
    activeConversationId: "conversation-1",
    selectedModel: "video-model",
    mode: "video" as const,
};

describe("creation submit workflow", () => {
    test("上传中的优先级高于空内容和忙碌状态", () => {
        assert.deepEqual(creationSubmissionStartGuard({ ...validInput, prompt: "", busy: true, pendingUploadCount: 1 }), {
            ok: false,
            level: "info",
            message: "素材仍在上传，完成后才能提交生成",
        });
        assert.deepEqual(creationSubmissionStartGuard({ ...validInput, prompt: "" }), { ok: false });
        assert.deepEqual(creationSubmissionStartGuard({ ...validInput, busy: true }), { ok: false });
        assert.deepEqual(creationSubmissionStartGuard({ ...validInput, activeConversationAvailable: false, activeConversationId: undefined }), { ok: false });
    });

    test("重试只允许写回原会话，且检查早于缺少模型", () => {
        assert.deepEqual(creationSubmissionStartGuard({ ...validInput, selectedModel: "", retryConversationId: "conversation-2" }), {
            ok: false,
            level: "warning",
            message: "已切换到其他创作，本次重试未执行",
        });
    });

    test("缺少模型按当前创作类型提示，合法输入返回去除首尾空白的正文", () => {
        assert.deepEqual(creationSubmissionStartGuard({ ...validInput, selectedModel: "", mode: "image" }), {
            ok: false,
            level: "warning",
            message: "请先在设置中配置图片模型",
        });
        assert.deepEqual(creationSubmissionStartGuard(validInput), { ok: true, text: "一个电影镜头" });
    });
});
