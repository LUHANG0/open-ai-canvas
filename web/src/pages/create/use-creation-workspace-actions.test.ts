import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { creationConversationDeleteCopy, creationWorkspaceUploadBlockMessage } from "./use-creation-workspace-actions";

describe("creation workspace actions", () => {
    test("没有上传任务时允许新建和切换", () => {
        assert.equal(creationWorkspaceUploadBlockMessage(0, "new"), undefined);
        assert.equal(creationWorkspaceUploadBlockMessage(-1, "switch"), undefined);
    });

    test("上传期间分别提示禁止新建和切换", () => {
        assert.equal(creationWorkspaceUploadBlockMessage(1, "new"), "素材正在上传，请等待完成后再新建创作");
        assert.equal(creationWorkspaceUploadBlockMessage(2, "switch"), "素材正在上传，请等待完成后再切换对话");
    });

    test("删除文案提供空标题回退、长度限制和素材保留说明", () => {
        assert.equal(creationConversationDeleteCopy({ title: "   " }).label, "新创作");
        const copy = creationConversationDeleteCopy({ title: "一".repeat(40) });
        assert.equal(copy.label, `${"一".repeat(32)}...`);
        assert.match(copy.content, /不会删除已上传或生成的任何素材/);
        assert.match(copy.content, /不可撤销/);
    });
});
