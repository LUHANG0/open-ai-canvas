import { expect, test } from "bun:test";
import { buildCanvasAssetCatalog, canvasAssetPreviewNode } from "@/lib/canvas/canvas-asset-catalog";
import { planCanvasAssetPromotion, planCanvasAssetRename } from "@/lib/canvas/canvas-asset-operations";
import { ensureCurrentMediaVersion, recordReplacedMediaVersion } from "@/lib/canvas/canvas-media-versions";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

function image(id: string): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, width: 320, height: 180, position: { x: 0, y: 0 }, metadata: { content: `/media/${id}`, storageKey: `resource:${id}`, status: "success", prompt: "original prompt", producedModel: "original model", resultRecord: { mediaKey: `resource:${id}`, model: "original model", taskId: `task-${id}` } } };
}
function history(id: string) {
    const first = ensureCurrentMediaVersion(image(id), { source: "generate" });
    return recordReplacedMediaVersion(first, { ...first, metadata: { ...first.metadata, content: `/media/${id}-new`, storageKey: `resource:${id}-new`, prompt: "new prompt", producedModel: "new model", resultRecord: { mediaKey: `resource:${id}-new`, model: "new model" } } }, "generate");
}
const entries = (nodes: CanvasNodeData[]) => buildCanvasAssetCatalog(nodes).flatMap((group) => group.entries);

test("catalog combines legacy root and A/B members even when every member has media history", () => {
    const a = history("a"), b = history("b"); a.title = "场景 · A"; b.title = "场景 · B";
    a.metadata = { ...a.metadata, versionLabel: "A", versionPrimary: true };
    b.metadata = { ...b.metadata, versionOfNodeId: "a", versionLabel: "B" };
    const before = structuredClone([a, b]); const [entry] = entries([a, b]);
    expect(entries([a, b])).toHaveLength(1); expect(entry.versions).toHaveLength(4);
    expect(entry.versions.filter((version) => version.primary)).toHaveLength(1);
    const renamed = planCanvasAssetRename([a, b], entry.key, "新场景")!;
    expect(renamed.nodes.map((node) => node.title)).toEqual(["新场景 · A", "新场景 · B"]);
    expect([a, b]).toEqual(before);
});

test("promotion adopts historical media and A/B primary atomically while preserving editable settings", () => {
    const a = history("a"), b = history("b");
    a.metadata = { ...a.metadata, versionOfNodeId: "a", versionPrimary: true };
    b.metadata = { ...b.metadata, versionOfNodeId: "a", model: "next model", prompt: "next prompt" };
    const [entry] = entries([a, b]); const version = entry.versions.find((version) => version.nodeId === "b" && version.label.endsWith("V1"))!;
    const plan = planCanvasAssetPromotion([a, b], version.key)!;
    expect(plan.changedIds).toEqual(["a", "b"]);
    expect(plan.nodes[0].metadata?.versionPrimary).toBe(false); expect(plan.nodes[1].metadata?.versionPrimary).toBe(true);
    expect(plan.nodes[1].metadata?.storageKey).toBe("resource:b");
    expect(plan.nodes[1].metadata?.resultRecord?.model).toBe("original model");
    expect(plan.nodes[1].metadata?.prompt).toBe("next prompt"); expect(plan.nodes[1].metadata?.model).toBe("next model");
    expect(b.metadata?.storageKey).toBe("resource:b-new");
});

test("failed regeneration with a single old version stays discoverable and restorable", () => {
    const node = ensureCurrentMediaVersion(image("failed"), { source: "generate" });
    node.metadata = { ...node.metadata, content: undefined, storageKey: undefined, status: "error", errorDetails: "failed" };
    const [entry] = entries([node]); expect(entry.kind).toBe("image"); expect(entry.versions).toHaveLength(1);
    expect(entry.versions[0].primary).toBe(false);
    const preview = canvasAssetPreviewNode(entry, new Map([[node.id, node]]))!;
    expect(preview.metadata?.storageKey).toBe("resource:failed");
    expect(planCanvasAssetPromotion([node], entry.versions[0].key)?.nodes[0].metadata?.status).toBe("success");
});

test("unregistered current media remains primary alongside recorded historical media", () => {
    const node = ensureCurrentMediaVersion(image("old"));
    node.metadata = { ...node.metadata, content: "/fresh", storageKey: "resource:fresh" };
    const [entry] = entries([node]); expect(entry.versions).toHaveLength(2);
    expect(entry.versions.find((version) => version.primary)?.mediaVersionId).toBeUndefined();
    expect(canvasAssetPreviewNode(entry, new Map([[node.id, node]]))?.metadata?.storageKey).toBe("resource:fresh");
});

test("batch promotion updates the proxy's identity and provenance, and layer parts cannot become primary", () => {
    const a = image("a"), b = history("b"), root = image("root");
    root.metadata = { ...root.metadata, isBatchRoot: true, batchChildIds: ["a", "b"], primaryImageId: "a", prompt: "batch prompt" };
    a.metadata = { ...a.metadata, batchRootId: "root" }; b.metadata = { ...b.metadata, batchRootId: "root" };
    const nodes = [b, root, a], [entry] = entries(nodes);
    expect(entries(nodes)).toHaveLength(1); expect(entry.versions[0].nodeId).toBe("a");
    const oldB = entry.versions.find((version) => version.nodeId === "b")!;
    const plan = planCanvasAssetPromotion(nodes, oldB.key)!;
    expect(plan.nodes[1].metadata?.primaryImageId).toBe("b"); expect(plan.nodes[1].metadata?.storageKey).toBe("resource:b-new");
    expect(plan.nodes[1].metadata?.resultRecord?.mediaKey).toBe("resource:b-new"); expect(plan.nodes[1].metadata?.prompt).toBe("batch prompt");
    root.metadata.imageLayerGroup = { layers: [] } as unknown as NonNullable<typeof root.metadata.imageLayerGroup>;
    const [layerEntry] = entries(nodes); expect(layerEntry.versions.every((version) => !version.promotable)).toBe(true);
    expect(planCanvasAssetPromotion(nodes, layerEntry.versions[0].key)).toBeNull();
    expect(canvasAssetPreviewNode(layerEntry, new Map(nodes.map((node) => [node.id, node])))?.id).toBe("root");
});

test("stale identities, locked members, generating batch roots and foreign batch links are rejected", () => {
    const a = history("a"), b = history("b"); a.metadata = { ...a.metadata, versionOfNodeId: "a", versionPrimary: true };
    b.metadata = { ...b.metadata, versionOfNodeId: "a" };
    const [entry] = entries([a, b]), key = entry.versions.find((version) => version.nodeId === "b")!.key;
    a.metadata.locked = true;
    expect(planCanvasAssetPromotion([a, b], key)).toBeNull(); expect(planCanvasAssetRename([a, b], entry.key, "x")).toBeNull();
    expect(planCanvasAssetPromotion([a], key)).toBeNull();
    const root = image("root"); root.metadata = { isBatchRoot: true, batchChildIds: ["b"], status: "loading" };
    b.metadata = { ...b.metadata, versionOfNodeId: undefined, batchRootId: "root" };
    const [batch] = entries([root, b]); expect(planCanvasAssetPromotion([root, b], batch.versions[0].key)).toBeNull();
    root.metadata = { ...root.metadata, batchChildIds: [] };
    expect(entries([root, b])).toHaveLength(1); expect(entries([root, b])[0].source).toBe("single");
});

test("catalog keeps text and Markdown separate and excludes workflow/empty/upload placeholders", () => {
    const text = { ...image("text"), type: CanvasNodeType.Text, metadata: { content: "hello" } };
    const markdown = { ...text, id: "md", title: "script.md" };
    const empty = { ...text, id: "empty", metadata: {} };
    const character = { ...text, id: "character", metadata: { content: "profile", workflowKind: "character" as const } };
    const uploading = { ...image("upload"), metadata: { fileUpload: "uploading" as const } };
    expect(entries([text, markdown, empty, character, uploading]).map((entry) => entry.kind)).toEqual(["txt", "markdown"]);
});

test("ordinary names keep literal version-like suffixes; experimental layers stay non-promotable", () => {
    const plain = image("plain"); plain.title = "素材 · A";
    expect(entries([plain])[0].title).toBe("素材 · A");
    const root = image("root"), child = image("child");
    root.metadata = { ...root.metadata, isBatchRoot: true, batchChildIds: [child.id], experimentalLayerPlan: { requests: [] } as unknown as NonNullable<NonNullable<CanvasNodeData["metadata"]>["experimentalLayerPlan"]> };
    child.metadata = { ...child.metadata, batchRootId: root.id };
    const [entry] = entries([root, child]); expect(entry.versions[0].promotable).toBe(false);
    expect(planCanvasAssetPromotion([root, child], entry.versions[0].key)).toBeNull();
});
