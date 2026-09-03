import { describe, expect, test } from "bun:test";

import type { CreationConversation } from "../src/pages/create/creation-types";
import { ApiError } from "../src/services/api/request";
import { mergeCreationConversations, syncCreationConversationWithMerge, type CreationConversationCloudDependencies } from "../src/services/creation-conversation-cloud-sync";

function conversation(id: string, messageIds: string[], extra: Partial<CreationConversation> = {}): CreationConversation {
    return {
        id,
        title: id,
        updatedAt: "2026-09-03T00:00:00.000Z",
        messages: messageIds.map((messageId, index) => ({ id: messageId, role: index % 2 ? "assistant" : "user", content: messageId, createdAt: `2026-09-03T00:00:0${index}.000Z` })),
        ...extra,
    };
}

describe("creation conversation cloud merge", () => {
    test("keeps concurrent messages from both devices in stable order", () => {
        const merged = mergeCreationConversations(conversation("conversation-1", ["user-1", "assistant-1"]), conversation("conversation-1", ["user-1", "assistant-1", "user-local"], { updatedAt: "2026-09-03T00:01:00.000Z" }));
        expect(merged.messages.map((message) => message.id)).toEqual(["user-1", "assistant-1", "user-local"]);
        expect(merged.updatedAt).toBe("2026-09-03T00:01:00.000Z");
    });

    test("message tombstones prevent replaced retry pairs from returning", () => {
        const remote = conversation("conversation-1", ["old-user", "old-assistant", "remote-new"]);
        const local = conversation("conversation-1", ["retry-user", "retry-assistant"], { deletedMessageIds: ["old-user", "old-assistant"] });
        const merged = mergeCreationConversations(remote, local);
        expect(merged.messages.map((message) => message.id)).toEqual(["retry-user", "retry-assistant", "remote-new"]);
        expect(merged.deletedMessageIds).toEqual(["old-user", "old-assistant"]);
    });

    test("409 reloads the remote revision, merges, and retries once", async () => {
        const remote = conversation("conversation-1", ["remote-message"]);
        const local = conversation("conversation-1", ["local-message"], { updatedAt: "2026-09-03T00:01:00.000Z" });
        const calls: Array<{ conversation: CreationConversation; revision: number }> = [];
        const dependencies: CreationConversationCloudDependencies = {
            list: async () => ({ conversations: [{ conversation: remote, revision: 4 }] }),
            upsert: async (next, revision) => {
                calls.push({ conversation: next, revision });
                if (calls.length === 1) throw new ApiError("conflict", { status: 409 });
                return { record: { conversation: next, revision: 5 } };
            },
            remove: async (id) => ({ id }),
        };

        const result = await syncCreationConversationWithMerge(local, 2, dependencies);
        expect(calls.map((call) => call.revision)).toEqual([2, 4]);
        expect(result.revision).toBe(5);
        expect(result.conversation.messages.map((message) => message.id)).toEqual(["remote-message", "local-message"]);
    });

    test("prepares attachment references before reporting a cloud write", async () => {
        const local = conversation("conversation-1", ["message-1"]);
        local.messages[0].attachments = [{ id: "image-1", name: "reference.png", type: "image/png", dataUrl: "data:image/png;base64,AA", url: "", storageKey: "image:user-1:legacy", previewUrl: "data:image/png;base64,AA" }];
        let uploaded: CreationConversation | undefined;
        const dependencies: CreationConversationCloudDependencies = {
            list: async () => ({ conversations: [] }),
            prepare: async (next) => ({
                ...next,
                messages: next.messages.map((message) => ({
                    ...message,
                    attachments: message.attachments?.map((attachment) => ({
                        ...attachment,
                        dataUrl: "/api/resources/resource-1/file",
                        url: "/api/resources/resource-1/file",
                        storageKey: "resource:resource-1",
                        previewUrl: "/api/resources/resource-1/file",
                    })),
                })),
            }),
            upsert: async (next) => {
                uploaded = next;
                return { record: { conversation: next, revision: 1 } };
            },
            remove: async (id) => ({ id }),
        };

        await syncCreationConversationWithMerge(local, 0, dependencies);
        expect(uploaded?.messages[0].attachments?.[0]).toMatchObject({ storageKey: "resource:resource-1", previewUrl: "/api/resources/resource-1/file" });
        expect(uploaded?.messages[0].attachments?.[0].dataUrl?.startsWith("data:")).toBe(false);
    });
});
