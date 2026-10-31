import { describe, expect, test } from "bun:test";
import type { GenerationTask } from "@/services/api/task-center";
import { workbenchTaskOutputs, workbenchDownloadName } from "../src/pages/workbench/workbench-outputs";
import { planWorkbenchReferences } from "../src/pages/workbench/workbench-reference-policy";
import type { WorkbenchReferenceSlot } from "@/services/api/workbench";

const task = { id: "task", status: "succeeded", previewUrl: "https://media.test/first.png" } as GenerationTask;
const slot = (key: string, maxCount = 1): WorkbenchReferenceSlot => ({ key, name: key, maxCount, minCount: 0, required: false, mediaTypes: ["image"] });
const image = (resourceId: string) => ({ resourceId, kind: "image" as const });
const limits = { image: 4, video: 1, audio: 0 };

describe("workbench result identity", () => {
    test("expands every image from details and uses resource identities rather than expiring URLs", () => {
        const detail = {
            ...task,
            resultJson: JSON.stringify({
                images: [
                    { resourceId: "r1", url: "https://expired.test/a", width: 2048, height: 1024 },
                    { storageKey: "resource:r2", mimeType: "image/webp" },
                ],
            }),
        };
        const outputs = workbenchTaskOutputs(task, "image", detail);
        expect(outputs).toHaveLength(2);
        expect(outputs[0]).toMatchObject({ key: "task:0", resourceId: "r1", width: 2048, height: 1024 });
        expect(outputs[0].url).toContain("/resources/r1/file");
        expect(outputs[1]).toMatchObject({ key: "task:1", resourceId: "r2", mimeType: "image/webp" });
    });
    test("keeps summary preview when details malformed and never renders failed-task stale output", () => {
        expect(workbenchTaskOutputs({ ...task, resultJson: "{" }, "image")[0].url).toBe(task.previewUrl);
        expect(workbenchTaskOutputs({ ...task, status: "failed" }, "image")).toEqual([]);
    });
    test("rejects executable media URLs and uses video playback variant", () => {
        expect(workbenchTaskOutputs({ ...task, previewUrl: "", resultJson: JSON.stringify({ images: [{ url: "javascript:alert(1)" }] }) }, "image")).toEqual([]);
        const output = workbenchTaskOutputs({ ...task, resultJson: JSON.stringify({ video: { resourceId: "movie", posterUrl: "/api/resources/poster/file?old=1" } }) }, "video")[0];
        expect(output.url).toContain("variant=playback");
        expect(output.thumbUrl).toContain("/resources/poster/file?variant=thumbnail");
    });
    test("download names preserve MIME extension and remove unsafe path characters", () => {
        const name = workbenchDownloadName({ kind: "image", url: "https://test/opaque", mimeType: "image/webp" }, "角色/侧脸", 2, new Date(2026, 10, 1, 8, 9));
        expect(name).toBe("角色_侧脸_20261101-0809_02.webp");
    });
});

describe("atomic reference selection", () => {
    test("plans every selection without mutating current references", () => {
        const current = [image("old")];
        expect(planWorkbenchReferences(current, [image("a"), image("b")], [], limits)).toHaveLength(2);
        expect(current).toEqual([image("old")]);
    });
    test("rejects the entire excess selection and wrong media type", () => {
        expect(() => planWorkbenchReferences([image("old")], [image("a"), image("b")], [], { ...limits, image: 2 })).toThrow("上限");
        expect(() => planWorkbenchReferences([], [{ resourceId: "audio", kind: "audio" }], [], limits)).toThrow("上限");
        expect(() => planWorkbenchReferences([], [{ resourceId: "v", kind: "video" }], [slot("subject")], limits)).toThrow("类型或数量");
    });
    test("honors explicit slots, rejects duplicates, and permits one asset for two frame slots", () => {
        const slots = [slot("first_frame"), slot("last_frame")];
        expect(planWorkbenchReferences([{ ...image("a"), slotKey: "first_frame" }], [image("a")], slots, limits, "last_frame")[0].slotKey).toBe("last_frame");
        expect(() => planWorkbenchReferences([], [image("a"), image("b")], slots, limits, "first_frame")).toThrow();
        expect(() => planWorkbenchReferences([], [image("a"), image("a")], [], limits)).toThrow("重复");
        expect(() => planWorkbenchReferences([], [image("a")], slots, limits, "missing")).toThrow();
    });
});
