import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { CreationConversation } from "./creation-types";
import { creationHistoryConversations, planCreationConversationDeletion } from "./use-creation-conversation-workflow";

function conversation(id: string, updatedAt: string, messageCount = 0): CreationConversation {
    return {
        id,
        title: id,
        updatedAt,
        messages: Array.from({ length: messageCount }, (_, index) => ({
            id: `${id}-${index}`,
            role: "user" as const,
            content: `${id} message ${index}`,
            createdAt: updatedAt,
        })),
    };
}

describe("creation conversation workflow", () => {
    test("历史列表保留当前空会话、隐藏其他空会话并按更新时间排序", () => {
        const result = creationHistoryConversations(
            [conversation("old", "2026-01-01T00:00:00.000Z", 1), conversation("active", "2026-01-02T00:00:00.000Z"), conversation("hidden", "2026-01-03T00:00:00.000Z"), conversation("latest", "2026-01-04T00:00:00.000Z", 1)],
            "active",
        );

        assert.deepEqual(result.map((item) => item.id), ["latest", "active", "old"]);
    });

    test("删除当前会话后优先切换到最近的非空会话", () => {
        const result = planCreationConversationDeletion(
            [conversation("active", "2026-01-04T00:00:00.000Z", 1), conversation("empty", "2026-01-05T00:00:00.000Z"), conversation("recent", "2026-01-03T00:00:00.000Z", 1)],
            "active",
            "active",
        );

        assert.equal(result.deletedActive, true);
        assert.equal(result.nextActiveId, "recent");
        assert.deepEqual(result.next.map((item) => item.id), ["empty", "recent"]);
    });

    test("删除唯一会话时自动建立可继续使用的新会话", () => {
        const result = planCreationConversationDeletion([conversation("only", "2026-01-01T00:00:00.000Z")], "only", "only");

        assert.equal(result.deletedActive, true);
        assert.equal(result.next.length, 1);
        assert.equal(result.next[0].title, "新创作");
        assert.equal(result.nextActiveId, result.next[0].id);
    });
});
