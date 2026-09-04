import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { GenerationTask } from "@/services/api/task-center";
import type { CreationConversation, CreationMessage, CreationSettings } from "./creation-types";
import {
    applyCreationSubmissionToConversation,
    cancelCreationSubmissionMessage,
    completeCreationSubmissionMessage,
    creationCancelableTaskIds,
    createCreationSubmissionMessages,
    createCreationTaskBindings,
    creationMessageWithBoundTask,
    failCreationSubmissionMessage,
    recordCreationTaskBinding,
} from "./creation-submission-transaction";

const settings: CreationSettings = { ratio: "16:9", seconds: "5", quality: "auto", videoQuality: "720", count: "1" };

function message(id: string, role: CreationMessage["role"], content = id): CreationMessage {
    return { id, role, content, createdAt: "2026-09-02T00:00:00.000Z" };
}

describe("creation submission transaction", () => {
    test("普通续作建立新镜头，并把用户消息连到来源消息", () => {
        const ids = ["user-id", "assistant-id"];
        const result = createCreationSubmissionMessages({
            text: "一段电影镜头",
            mode: "video",
            selectedModel: "video-model",
            attachments: [],
            references: [],
            settings,
            continuationParentMessageId: "source-assistant",
            createId: () => ids.shift() || "fallback-id",
            now: () => "2026-09-02T01:00:00.000Z",
        });

        assert.equal(result.userMessage.id, "user-id");
        assert.equal(result.userMessage.content, "一段电影镜头");
        assert.equal(result.userMessage.parentMessageId, "source-assistant");
        assert.equal(result.assistantMessage.id, "assistant-id");
        assert.equal(result.assistantMessage.parentMessageId, "user-id");
        assert.equal(result.assistantMessage.status, "pending");
    });

    test("重试保留原镜头 ID、分支父消息和尝试上下文", () => {
        const ids = ["unused-user-id", "assistant-id"];
        const result = createCreationSubmissionMessages({
            text: "一段电影镜头",
            mode: "video",
            selectedModel: "video-model",
            attachments: [],
            references: [],
            settings,
            continuationParentMessageId: "unrelated-current-continuation",
            retryContext: { clientOperationId: "operation-1", retryOf: "task-0", attemptGroupId: "attempt-1" },
            retryTarget: { shotId: "stable-shot", parentMessageId: "original-source-assistant" },
            createId: () => ids.shift() || "fallback-id",
            now: () => "2026-09-02T01:00:00.000Z",
        });

        assert.equal(result.userMessage.id, "stable-shot");
        assert.equal(result.userMessage.parentMessageId, "original-source-assistant");
        assert.equal(result.assistantMessage.id, "assistant-id");
        assert.equal(result.assistantMessage.parentMessageId, "stable-shot");
        assert.equal(result.assistantMessage.clientOperationId, "operation-1");
    });

    test("普通提交追加消息，重试提交在原镜头位置替换消息对", () => {
        const empty: CreationConversation = { id: "conversation", title: "新创作", updatedAt: "old", messages: [] };
        const user = message("new-user", "user");
        const assistant = message("new-assistant", "assistant");
        const appended = applyCreationSubmissionToConversation({ conversation: empty, text: "超过二十四个字符时只截取标题所需的前二十四个字符内容", userMessage: user, assistantMessage: assistant, updatedAt: "new" });
        assert.equal(appended.title, "超过二十四个字符时只截取标题所需的前二十四个字符");
        assert.deepEqual(
            appended.messages.map((item) => item.id),
            ["new-user", "new-assistant"],
        );

        const existing: CreationConversation = {
            id: "conversation",
            title: "已有创作",
            updatedAt: "old",
            messages: [message("before", "assistant"), message("old-user", "user"), message("old-assistant", "assistant"), message("after", "user")],
        };
        const replaced = applyCreationSubmissionToConversation({
            conversation: existing,
            text: "重试",
            userMessage: user,
            assistantMessage: assistant,
            retryTarget: { conversationId: "conversation", shotId: "new-user", userMessageId: "old-user", assistantMessageId: "old-assistant" },
            updatedAt: "new",
        });
        assert.deepEqual(
            replaced.messages.map((item) => item.id),
            ["before", "new-user", "new-assistant", "after"],
        );
        assert.equal(replaced.title, "已有创作");
        assert.deepEqual(replaced.deletedMessageIds, ["old-user", "old-assistant"]);

        const stableUserRetry = applyCreationSubmissionToConversation({
            conversation: { ...existing, deletedMessageIds: ["old-user", "older-assistant"] },
            text: "原位重试",
            userMessage: message("old-user", "user"),
            assistantMessage: message("replacement-assistant", "assistant"),
            retryTarget: { conversationId: "conversation", shotId: "old-user", userMessageId: "old-user", assistantMessageId: "old-assistant" },
            updatedAt: "newer",
        });
        assert.deepEqual(
            stableUserRetry.messages.map((item) => item.id),
            ["before", "old-user", "replacement-assistant", "after"],
        );
        assert.deepEqual(stableUserRetry.deletedMessageIds, ["older-assistant", "old-assistant"]);
    });

    test("任务绑定同时维护批次索引、任务快照和消息去重 ID", () => {
        const bindings = createCreationTaskBindings();
        const task = {
            id: "task-1",
            stage: "running",
            operation: "image",
            clientOperationId: "operation-1",
            retryOf: "task-0",
            attemptGroupId: "attempt-1",
            clientContext: { batchIndex: 2 },
        } as GenerationTask;
        recordCreationTaskBinding(bindings, task);
        recordCreationTaskBinding(bindings, task);
        const updated = creationMessageWithBoundTask({ ...message("assistant", "assistant"), taskIds: ["task-1"] }, task);

        assert.deepEqual(Array.from(bindings.taskIds), ["task-1"]);
        assert.equal(bindings.taskIdsByBatchIndex.get(2), "task-1");
        assert.equal(bindings.tasks.get("task-1"), task);
        assert.deepEqual(updated.taskIds, ["task-1"]);
        assert.equal(updated.generationStage, "running");
        assert.equal(updated.attemptGroupId, "attempt-1");
    });

    test("停止只能在后端任务 ID 已绑定后执行", () => {
        assert.deepEqual(creationCancelableTaskIds(), []);
        assert.deepEqual(creationCancelableTaskIds(["", "task-1", "task-1", "task-2"]), ["task-1", "task-2"]);
    });

    test("完成、取消和失败分别按既有生命周期字段收口", () => {
        const pending = { ...message("assistant", "assistant"), status: "pending" as const, generationErrorCode: "upstream-code" };
        assert.deepEqual(completeCreationSubmissionMessage(pending, "done-at"), { ...pending, status: "done", completedAt: "done-at" });
        assert.deepEqual(cancelCreationSubmissionMessage(pending, "cancelled-at"), { ...pending, status: "cancelled", completedAt: "cancelled-at", content: "已停止" });

        const failed = failCreationSubmissionMessage(pending, new Error("上游失败"), { operation: "image_to_video", assistantCreatedAt: "created-at", completedAt: "failed-at" });
        assert.equal(failed.status, "error");
        assert.equal(failed.error, "上游失败");
        assert.equal(failed.generationErrorCode, "upstream-code");
        assert.equal(failed.generationOperation, "image_to_video");
        assert.equal(failed.createdAt, "created-at");
        assert.equal(failed.completedAt, "failed-at");
        assert.equal(failed.content, "生成失败");
    });
});
