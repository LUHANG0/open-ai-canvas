import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { GenerationTask } from "@/services/api/task-center";
import { attachCreationTaskContexts, conversationTimestamp, reconcileCreationTaskMessages } from "./creation-task-lifecycle";
import type { CreationConversation } from "./creation-types";

function generationTask(id: string, status: GenerationTask["status"]): GenerationTask {
    return {
        id,
        type: "image",
        status,
        prompt: "旧提示词",
        attempts: 1,
        createdAt: "2026-09-02T08:00:00.000Z",
        updatedAt: "2026-09-02T08:01:00.000Z",
    };
}

function pendingConversation(taskIds: string[]): CreationConversation {
    return {
        id: "conversation-1",
        title: "测试会话",
        updatedAt: "2026-09-02T08:00:00.000Z",
        messages: [
            { id: "user-1", role: "user", content: "新的提示词", createdAt: "2026-09-02T08:00:00.000Z" },
            { id: "assistant-1", role: "assistant", mode: "image", content: "生成中", status: "pending", taskIds, createdAt: "2026-09-02T08:00:01.000Z" },
        ],
    };
}

describe("creation task lifecycle", () => {
    test("为历史任务补齐会话、消息和批次上下文", () => {
        const conversations = [pendingConversation(["task-1", "task-2"])];
        const unrelated = generationTask("task-other", "running");
        const tasks = attachCreationTaskContexts([generationTask("task-1", "running"), generationTask("task-2", "queued"), unrelated], conversations);

        assert.equal(tasks[0].prompt, "新的提示词");
        assert.deepEqual(tasks[0].clientContext, { conversationId: "conversation-1", messageId: "assistant-1", batchIndex: 0, batchCount: 2 });
        assert.deepEqual(tasks[1].clientContext, { conversationId: "conversation-1", messageId: "assistant-1", batchIndex: 1, batchCount: 2 });
        assert.equal(tasks[2], unrelated);
    });

    test("全部批次完成后按顺序回填去重结果并结束等待状态", () => {
        const conversations = [pendingConversation(["task-1", "task-2"])];
        const tasks = attachCreationTaskContexts([generationTask("task-1", "succeeded"), generationTask("task-2", "succeeded")], conversations).map((task, index) => ({
            ...task,
            updatedAt: `2026-09-02T08:0${index + 2}:00.000Z`,
            creationResultUrls: index === 0 ? ["https://example.com/one.png"] : ["https://example.com/one.png", "https://example.com/two.png"],
        }));

        const [conversation] = reconcileCreationTaskMessages(conversations, tasks);
        assert.notEqual(conversation, conversations[0]);
        assert.equal(conversation.updatedAt, "2026-09-02T08:03:00.000Z");
        assert.deepEqual({
            status: conversation.messages[1].status,
            content: conversation.messages[1].content,
            resultUrls: conversation.messages[1].resultUrls,
            taskIds: conversation.messages[1].taskIds,
        }, {
            status: "done",
            content: "图片已生成",
            resultUrls: ["https://example.com/one.png", "https://example.com/two.png"],
            taskIds: ["task-1", "task-2"],
        });
    });

    test("全部任务取消后恢复为已停止，不把取消误报为失败", () => {
        const conversations = [pendingConversation(["task-1", "task-2"])];
        const tasks = attachCreationTaskContexts([generationTask("task-1", "cancelled"), generationTask("task-2", "cancelled")], conversations);

        const [conversation] = reconcileCreationTaskMessages(conversations, tasks);
        assert.deepEqual({
            status: conversation.messages[1].status,
            content: conversation.messages[1].content,
            error: conversation.messages[1].error,
        }, { status: "cancelled", content: "已停止", error: undefined });
    });

    test("无效时间不会参与完成时间比较", () => {
        assert.equal(conversationTimestamp("not-a-date"), 0);
        assert.ok(conversationTimestamp("2026-09-02T08:00:00.000Z") > 0);
    });
});
