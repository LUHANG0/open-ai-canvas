import { expect, test } from "bun:test";
import { creationMessageResultRecords, reconcileCreationTaskMessages } from "../src/pages/create/creation-conversations";
import { historyMessagePayload, conversationFromHistory } from "../src/services/creation-history-payload";
import { creationHistoryMedia } from "../src/services/creation-history-media";
import { pendingCreationTaskIds, persistableCreationConversations } from "../src/services/creation-conversation-store";
import type { CreationConversation, CreationMessage } from "../src/pages/create/creation-types";
import type { GenerationTask } from "../src/services/api/task-center";

const message: CreationMessage = { id: "reply", role: "assistant", mode: "image", status: "pending", content: "", createdAt: "2026-10-25T00:00:00Z", taskIds: ["task-a"] };
const task: GenerationTask = { id: "task-a", type: "canvas_image", status: "succeeded", prompt: "", model: "actual-model", attempts: 1, createdAt: message.createdAt, completedAt: "2026-10-25T00:01:00Z", updatedAt: "2026-10-25T00:01:00Z", resultJson: JSON.stringify({ images: [{ storageKey: "resource:a", width: 1024, height: 768 }, { storageKey: "resource:b", width: 2048, height: 2048 }] }), billing: { status: "running", amountMicrocredits: 9000000 } };

test("recovery stores output-specific pixels and one task identity; retry keeps distinct provenance", () => {
    const records = creationMessageResultRecords(message, task, ["resource:a", "resource:b"])!;
    expect(records.map((record) => [record.taskId, record.mediaKey, record.width, record.height])).toEqual([["task-a", "resource:a", 1024, 768], ["task-a", "resource:b", 2048, 2048]]);
    const original = { ...message, resultRecords: records };
    const repeated = creationMessageResultRecords(original, task, ["resource:a", "resource:b"])!;
    expect(repeated).toHaveLength(2);
    const retry = creationMessageResultRecords(original, { ...task, id: "task-retry", retryOf: task.id }, ["resource:retry"])!;
    expect(retry.map((record) => record.taskId)).toEqual(["task-a", "task-a", "task-retry"]);
    const failed = creationMessageResultRecords(original, { ...task, status: "failed" }, ["resource:failure"]);
    expect(failed).toBe(records);
});

test("completed history readback retains pending then settles zero through reconciliation without reattaching or losing results", async () => {
    const records = creationMessageResultRecords(message, task, ["resource:a", "resource:b"])!;
    const completed: CreationMessage = { ...message, status: "done", resultRecords: records, resultStorageKeys: ["resource:a", "resource:b"], resultUrls: ["/temporary-a", "/temporary-b"] };
    const conversation: CreationConversation = { id: "conversation", title: "fixture", updatedAt: task.updatedAt, messages: [completed] };
    const local = persistableCreationConversations([conversation])[0];
    expect(local.messages[0].resultUrls).toBeUndefined();
    const prepare = creationHistoryMedia("guest", new AbortController().signal, () => true);
    const payload = await prepare(completed);
    expect(payload).toEqual(historyMessagePayload(local.messages[0]));
    expect(JSON.stringify(payload)).not.toContain("temporary");
    expect(JSON.stringify(payload)).not.toContain("amountMicrocredits");
    const readback = conversationFromHistory(JSON.parse(JSON.stringify({ ...conversation, messages: [{ id: message.id, revision: 1, data: payload }] })));
    expect(readback.messages[0].resultRecords).toEqual(records);
    expect(pendingCreationTaskIds([readback])).toEqual(["task-a"]);
    const reconciled = reconcileCreationTaskMessages({} as never, [readback], [{ ...task, billing: { status: "settled", amountMicrocredits: 9000000, actualAmountMicrocredits: 0 }, creationResultStorageKeys: ["resource:a", "resource:b"] }]);
    expect(reconciled[0].messages[0].resultRecords?.every((record) => record.billing?.actualAmountMicrocredits === 0)).toBe(true);
    expect(reconciled[0].messages[0].resultStorageKeys).toEqual(["resource:a", "resource:b"]);
    expect(pendingCreationTaskIds(reconciled)).toEqual([]);
});

test("pending multi-task recovery keeps all tasks and their totals distinct", () => {
    const other = { ...task, id: "task-b", clientContext: { conversationId: "conversation", messageId: "reply", batchIndex: 1, batchCount: 2 }, creationResultStorageKeys: ["resource:c"] };
    const first = { ...task, clientContext: { conversationId: "conversation", messageId: "reply", batchIndex: 0, batchCount: 2 }, creationResultStorageKeys: ["resource:a", "resource:b"] };
    const conversation: CreationConversation = { id: "conversation", title: "fixture", updatedAt: task.createdAt, messages: [{ ...message, taskIds: ["task-a", "task-b"] }] };
    expect(reconcileCreationTaskMessages({} as never, [conversation], [first])[0].messages[0].status).toBe("pending");
    const result = reconcileCreationTaskMessages({} as never, [conversation], [first, other])[0].messages[0];
    expect(result.status).toBe("done");
    expect(result.resultRecords?.map((record) => record.taskId)).toEqual(["task-a", "task-a", "task-b"]);
    expect(result.resultStorageKeys).toEqual(["resource:a", "resource:b", "resource:c"]);
});

test("history migration rebinds snapshot identity with the local media key, never to an unrelated replacement", async () => {
    const resultRecords = creationMessageResultRecords(message, task, ["image:guest:local"])!;
    const prepare = creationHistoryMedia("guest", new AbortController().signal, () => true);
    const payload = await prepare({ ...message, status: "done", resultRecords, resultStorageKeys: ["image:guest:local"], resultUrls: ["/api/resources/remote/file"] });
    expect(payload.resultStorageKeys).toEqual(["resource:remote"]);
    expect((payload.resultRecords as typeof resultRecords)[0].mediaKey).toBe("resource:remote");
    const replaced = await prepare({ ...message, status: "done", resultRecords, resultStorageKeys: ["resource:replacement"] });
    expect(replaced.resultRecords).toEqual([]);
});
