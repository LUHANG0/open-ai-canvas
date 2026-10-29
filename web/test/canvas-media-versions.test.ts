import { describe, expect, test } from "bun:test";
import { adoptMediaVersion, createNodeFromMediaVersion, currentMediaVersion, ensureCurrentMediaVersion, hasMediaVersionHistory, listMediaVersions, MEDIA_VERSION_LIMIT, mediaVersionFieldsBeforeReplace, mediaVersionPreviewNode, recordCommittedMediaVersion, recordReplacedMediaVersion, removeMediaVersion } from "@/lib/canvas/canvas-media-versions";
import { commitCanvasGenerationResult } from "@/lib/canvas/canvas-generation-result";
import { canGenerateImageInPlace, canGenerateMediaInPlace } from "@/lib/canvas/canvas-generation-layout";
import { canvasResultRecord, canvasResultSettlementTaskIds, reconcileCanvasResultBilling } from "@/lib/canvas/canvas-result-record";
import { isolateCopiedNodeMetadata } from "@/lib/canvas/canvas-node-copy";
import { canvasPersistentNodes } from "@/lib/canvas/canvas-persistent-nodes";
import { collectImageStorageKeys } from "@/services/image-storage";
import { collectMediaStorageKeys } from "@/services/file-storage";
import { collectLocalMediaKeys, ensureRemoteResourceReferences } from "@/services/user-data-sync-media";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";
import type { GenerationTask } from "@/services/api/task-center";

function node(key = "old", extra: CanvasNodeMetadata = {}): CanvasNodeData {
    return { id: "node", type: CanvasNodeType.Image, title: "用户标题", position: { x: 10, y: 20 }, width: 400, height: 225, metadata: {
        content: `/media/${key}`, storageKey: `resource:${key}`, status: "success", prompt: `prompt-${key}`, composerContent: `prompt-${key}`,
        model: `selected-${key}`, producedModel: `model-${key}`, taskId: `task-${key}`, taskStatus: "succeeded", assetId: `asset-${key}`,
        naturalWidth: 1920, naturalHeight: 1080,
        resultRecord: { mediaKey: `resource:${key}`, taskId: `task-${key}`, model: `model-${key}`, outputCount: 1, completedAt: "2026-10-29T01:00:00Z", billing: { actualAmountMicrocredits: key === "old" ? 120000 : 240000, scope: "result" } }, ...extra,
    } };
}
function twoVersions() {
    const first = ensureCurrentMediaVersion(node());
    return recordReplacedMediaVersion(first, node("new", { prompt: "next prompt", composerContent: "next prompt", size: "1:1" }), "generate");
}

describe("same-node media history", () => {
    test("same resource with a renewed URL is a single immutable version", () => {
        const first = ensureCurrentMediaVersion(node());
        expect(ensureCurrentMediaVersion(first)).toBe(first);
        const renewed = ensureCurrentMediaVersion({ ...first, metadata: { ...first.metadata, content: "/signed/new-url" } });
        expect(listMediaVersions(renewed)).toHaveLength(1);
        expect(currentMediaVersion(renewed)?.id).toBe(currentMediaVersion(first)?.id);
        first.metadata!.resultRecord!.model = "mutated";
        expect(currentMediaVersion(first)?.generation?.resultRecord?.model).toBe("model-old");
    });
    test("adopt restores media-bound price/model while keeping next prompt, settings, title and position", () => {
        const next = twoVersions(), old = listMediaVersions(next)[0];
        const adopted = adoptMediaVersion(next, old.id)!;
        expect(adopted).toMatchObject({ id: "node", title: "用户标题", position: next.position, metadata: { storageKey: "resource:old", model: "selected-new", prompt: "next prompt", composerContent: "next prompt", size: "1:1", producedModel: "model-old" } });
        expect(adopted.metadata?.taskId).toBeUndefined();
        expect(canvasResultRecord(adopted)?.model).toBe("model-old");
        expect(canvasResultRecord(adopted)?.facts).toContain("0.12积分");
        expect(listMediaVersions(adopted)).toHaveLength(2);
        expect(currentMediaVersion(adopted)?.id).toBe(old.id);
        expect(currentMediaVersion(next)?.media.storageKey).toBe("resource:new");
    });
    test("generation captures old media before clearing it, and failed generation can restore it", () => {
        const before = node();
        const pending = { ...before, metadata: { ...before.metadata, ...mediaVersionFieldsBeforeReplace(before), content: undefined, storageKey: undefined, status: "loading" as const, taskId: "next-task" } };
        expect(recordCommittedMediaVersion(pending)).toBe(pending);
        expect(hasMediaVersionHistory(pending)).toBe(true);
        expect(adoptMediaVersion(pending, listMediaVersions(pending)[0].id)).toBeNull();
        const failed = { ...pending, metadata: { ...pending.metadata, status: "error" as const } };
        const restored = adoptMediaVersion(failed, listMediaVersions(failed)[0].id)!;
        expect(restored.metadata?.storageKey).toBe("resource:old");
        expect(() => commitCanvasGenerationResult([restored], pending, node("late"), "next-task")).toThrow("其他生成任务");
    });
    test("successful commit keeps latest user edits and records only once on repeated result observation", () => {
        const pending = { ...node(), metadata: { ...node().metadata, ...mediaVersionFieldsBeforeReplace(node()), taskId: "new-task", status: "loading" as const } };
        const result = { ...node("new"), metadata: { ...pending.metadata, ...node("new").metadata, taskId: "new-task" } };
        const edited = { ...pending, title: "edited", position: { x: 999, y: 888 }, width: 600, height: 300, metadata: { ...pending.metadata, manualSize: true } };
        const committed = commitCanvasGenerationResult([edited], pending, result, "new-task");
        expect(committed[0]).toMatchObject({ title: "edited", position: edited.position, width: 600, metadata: { manualSize: true } });
        expect(listMediaVersions(committed[0])).toHaveLength(2);
        expect(listMediaVersions(commitCanvasGenerationResult(committed, pending, result, "new-task")[0])).toHaveLength(2);
    });
    test("uploads clear generation provenance and type-changing replacement starts new history", () => {
        const previous = twoVersions();
        const uploaded = recordReplacedMediaVersion(previous, node("upload", { taskId: undefined, taskStatus: undefined, producedModel: undefined, resultRecord: undefined }), "upload");
        const version = currentMediaVersion(uploaded)!;
        expect(version.source).toBe("upload"); expect(version.generation).toBeUndefined();
        const adopted = adoptMediaVersion(uploaded, version.id)!;
        expect(adopted.metadata?.resultRecord).toBeUndefined(); expect(adopted.metadata?.producedModel).toBeUndefined();
        const video = recordReplacedMediaVersion(previous, { ...node("video"), type: CanvasNodeType.Video }, "upload");
        expect(listMediaVersions(video)).toHaveLength(1);
    });
    test("current/locked/loading versions cannot be removed, history removal does not change current resource", () => {
        const next = twoVersions(), versions = listMediaVersions(next);
        expect(removeMediaVersion(next, versions[1].id)).toBeNull();
        expect(removeMediaVersion({ ...next, metadata: { ...next.metadata, locked: true } }, versions[0].id)).toBeNull();
        expect(adoptMediaVersion({ ...next, metadata: { ...next.metadata, fileUpload: "uploading" } }, versions[0].id)).toBeNull();
        const removed = removeMediaVersion(next, versions[0].id)!;
        expect(listMediaVersions(removed)).toHaveLength(1); expect(removed.metadata?.storageKey).toBe("resource:new");
    });
    test("extract and copy have independent histories/task identity and preserve historical provenance", () => {
        const next = twoVersions(), old = listMediaVersions(next)[0];
        const extracted = createNodeFromMediaVersion(next, old.id, "extracted")!;
        expect(extracted.metadata).toMatchObject({ storageKey: "resource:old", prompt: "prompt-old", producedModel: "model-old", generationResultPlacement: "replace-node" });
        for (const key of ["taskId", "assetId", "mediaVersions", "currentMediaVersionId", "generationEffectKeys"] as const) expect(extracted.metadata?.[key]).toBeUndefined();
        expect(canvasResultRecord(extracted)?.facts).toContain("0.12积分");
        expect(isolateCopiedNodeMetadata(next, new Map()).mediaVersions).toBeUndefined();
        const preview = mediaVersionPreviewNode(next, old);
        expect(preview.metadata?.taskId).toBeUndefined(); expect(canvasResultRecord(preview)?.model).toBe("model-old");
    });
    test("adoption fits old ratio without changing manually resized nodes", () => {
        const next = twoVersions(), old = listMediaVersions(next)[0]; old.media.naturalWidth = 1080; old.media.naturalHeight = 1920;
        expect(adoptMediaVersion(next, old.id)).toMatchObject({ width: 225, height: 400 });
        expect(adoptMediaVersion({ ...next, metadata: { ...next.metadata, manualSize: true } }, old.id)).toMatchObject({ width: 400, height: 225 });
    });
    test("retention keeps thirty latest versions without reusing version numbers", () => {
        let current = node();
        for (let i = 1; i <= 35; i++) current = recordReplacedMediaVersion(current, node(`output-${i}`), "generate");
        expect(listMediaVersions(current)).toHaveLength(MEDIA_VERSION_LIMIT);
        expect(listMediaVersions(current)[0].number).toBe(7);
        expect(currentMediaVersion(current)?.number).toBe(36);
    });
    test("single generated media reuses node; imported, batch, layer and explicit new-version placements retain boundaries", () => {
        expect(canGenerateImageInPlace(node())).toBe(true); expect(canGenerateImageInPlace(node(), 4)).toBe(false);
        for (const type of [CanvasNodeType.Video, CanvasNodeType.Audio]) expect(canGenerateMediaInPlace({ ...node(), type }, type)).toBe(true);
        for (const extra of [{ isBatchRoot: true }, { batchRootId: "parent" }, { layerExtraction: {} }, { fileUpload: "done" }, { generationResultPlacement: "new-version" }]) expect(canGenerateImageInPlace(node("old", extra as CanvasNodeMetadata))).toBe(false);
        const batch = node("batch", { isBatchRoot: true }); expect(recordCommittedMediaVersion(batch)).toBe(batch);
    });
    test("pending billing remains observed in old history and settles with identity-preserving repeat", () => {
        const old = node("old", { resultRecord: { mediaKey: "resource:old", taskId: "task-old", outputCount: 1, billingStatus: "pending" } });
        const next = recordReplacedMediaVersion(old, node("new"), "generate");
        expect(canvasResultSettlementTaskIds([next])).toEqual(["task-old"]);
        const task = { id: "task-old", status: "succeeded", billing: { status: "settled", actualAmountMicrocredits: 120000 } } as GenerationTask;
        const settled = reconcileCanvasResultBilling([next], task);
        expect(listMediaVersions(settled[0])[0].generation?.resultRecord?.billing?.actualAmountMicrocredits).toBe(120000);
        expect(settled[0].metadata?.resultRecord?.taskId).toBe("task-new");
        expect(canvasResultSettlementTaskIds(settled)).toEqual([]);
        expect(reconcileCanvasResultBilling(settled, task)).toBe(settled);
    });
    test("persistent projection and recursive local garbage collection retain old media and posters", () => {
        const next = twoVersions(), old = listMediaVersions(next)[0];
        old.media.storageKey = "image:user:old"; old.media.videoPreview = { storageKey: "image:user:poster" } as never;
        const saved = JSON.parse(JSON.stringify(canvasPersistentNodes([next])));
        expect(saved[0].metadata.mediaVersions).toHaveLength(2);
        expect(collectImageStorageKeys(saved).has("image:user:old")).toBe(true);
        expect(collectMediaStorageKeys(saved).has("image:user:poster")).toBe(true);
        expect(collectLocalMediaKeys(saved)).toContain("image:user:old");
    });
    test("nested local-resource upload rebinds historical result provenance as well as media", async () => {
        const next = twoVersions(), old = listMediaVersions(next)[0];
        old.media.storageKey = "image:user:old"; old.generation!.resultRecord!.mediaKey = "image:user:old";
        const saved = await ensureRemoteResourceReferences(next, new Map([["image:user:old", "resource:remote-old"]]));
        expect(listMediaVersions(saved)[0].media.storageKey).toBe("resource:remote-old");
        expect(listMediaVersions(saved)[0].generation?.resultRecord?.mediaKey).toBe("resource:remote-old");
    });
    test("malformed history entries do not become selectable versions", () => {
        const invalid = node("old", { mediaVersions: [null, {}, { id: "bad", number: 1, media: {} }] as never });
        expect(listMediaVersions(invalid)).toEqual([]); expect(hasMediaVersionHistory(invalid)).toBe(false);
        expect(canvasResultSettlementTaskIds([invalid])).toEqual([]);
        const nodes = [invalid];
        expect(reconcileCanvasResultBilling(nodes, { id: "unrelated" } as never)).toBe(nodes);
        expect(listMediaVersions(ensureCurrentMediaVersion(invalid))).toHaveLength(1);
    });
});
