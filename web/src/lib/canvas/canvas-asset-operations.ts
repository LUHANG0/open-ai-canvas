import { buildCanvasAssetCatalog } from "./canvas-asset-catalog";
import { adoptMediaVersion, mediaVersionAdoptBlock } from "./canvas-media-versions";
import { applyBatchPrimaryImage } from "./canvas-project-domain";
import { resetGenerationTaskMetadata } from "./canvas-task-state";
import type { CanvasNodeData } from "@/types/canvas";

export type CanvasAssetMutation = { nodes: CanvasNodeData[]; changedIds: string[] };

// Resolve against the latest nodes; the UI's catalog can be stale after a remote edit.
export function planCanvasAssetRename(nodes: CanvasNodeData[], entryKey: string, title: string): CanvasAssetMutation | null {
    const entry = buildCanvasAssetCatalog(nodes).flatMap((group) => group.entries).find((item) => item.key === entryKey);
    if (!entry || !title.trim()) return null;
    const ids = new Set(entry.source === "version-group" ? entry.memberIds : [entry.nodeId]);
    const members = nodes.filter((node) => ids.has(node.id));
    if (members.some((node) => node.metadata?.locked)) return null;
    const changedIds: string[] = [];
    const next = nodes.map((node) => {
        if (!ids.has(node.id)) return node;
        const suffix = entry.source === "version-group" ? node.metadata?.versionLabel : undefined;
        const nextTitle = suffix ? `${title.trim()} · ${suffix}` : title.trim();
        if (node.title === nextTitle) return node;
        changedIds.push(node.id);
        return { ...node, title: nextTitle };
    });
    return { nodes: next, changedIds };
}

export function planCanvasAssetPromotion(nodes: CanvasNodeData[], versionKey: string): CanvasAssetMutation | null {
    const entry = buildCanvasAssetCatalog(nodes).flatMap((group) => group.entries).find((item) => item.versions.some((version) => version.key === versionKey));
    const version = entry?.versions.find((item) => item.key === versionKey);
    if (!entry || !version?.promotable || version.primary) return null;
    const target = nodes.find((node) => node.id === version.nodeId);
    if (!target) return null;
    const affected = new Set(entry.source === "version-group" ? entry.memberIds : [target.id]);
    if (entry.source === "batch") affected.add(entry.nodeId);
    if (nodes.some((node) => affected.has(node.id) && mediaVersionAdoptBlock(node))) return null;
    const adopted = version.mediaVersionId ? adoptMediaVersion(target, version.mediaVersionId) : target;
    if (!adopted) return null;
    const next = nodes.map((node) => {
        let updated = node.id === target.id ? adopted : node;
        if (entry.source === "version-group" && affected.has(node.id)) updated = { ...updated, metadata: { ...updated.metadata, versionPrimary: node.id === target.id } };
        if (entry.source === "batch" && node.id === entry.nodeId) {
            updated = applyBatchPrimaryImage(node, adopted);
            updated = { ...updated, metadata: { ...resetGenerationTaskMetadata(updated.metadata, "success"),
                previewContent: adopted.metadata?.previewContent, resultRecord: adopted.metadata?.resultRecord,
                producedModel: adopted.metadata?.producedModel, producedModelCandidate: undefined,
                taskDurationMs: adopted.metadata?.taskDurationMs } };
        }
        return updated;
    });
    return { nodes: next, changedIds: [...affected] };
}
