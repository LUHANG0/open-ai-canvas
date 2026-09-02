import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { creationGeneratedImagesWithTasks, creationImageCompletion } from "./creation-generation-executor";

describe("creation generation executor", () => {
    test("批量图片按批次索引关联稳定任务，失败批次不打乱后续映射", () => {
        const settled: PromiseSettledResult<{ images?: string[] }>[] = [
            { status: "fulfilled", value: { images: ["image-0-a", "image-0-b"] } },
            { status: "rejected", reason: new Error("batch failed") },
            { status: "fulfilled", value: { images: ["image-2"] } },
        ];
        const mapped = creationGeneratedImagesWithTasks(
            settled,
            new Set(["task-0", "task-1", "task-2"]),
            new Map([[2, "task-explicit-2"]]),
        );

        assert.deepEqual(mapped, [
            { image: "image-0-a", taskId: "task-0", batchIndex: 0 },
            { image: "image-0-b", taskId: "task-0", batchIndex: 0 },
            { image: "image-2", taskId: "task-explicit-2", batchIndex: 2 },
        ]);
    });

    test("图片全部成功时只返回完成正文，不产生警告", () => {
        assert.deepEqual(creationImageCompletion(2, 0), { content: "图片已生成", warning: "" });
    });

    test("图片部分失败时区分对话正文和用户提示文案", () => {
        assert.deepEqual(creationImageCompletion(2, 1), {
            content: "2 张图片已生成，1 张失败",
            warning: "2 张图片已生成，1 张生成失败",
        });
    });
});
