import type { Asset } from "@/stores/use-asset-store";

export type AssetOriginalDocument = { storageKey: string; fileName: string; mimeType: string; bytes: number };

/** 原件放在独立元数据中，编辑正文时仍保留原件，媒体同步不会把正文改成文件 URL。 */
export function assetOriginalDocument(asset: Pick<Asset, "kind" | "metadata">): AssetOriginalDocument | undefined {
    if (asset.kind !== "text") return undefined;
    const value = asset.metadata?.originalDocument;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.storageKey !== "string" || !record.storageKey.trim() || typeof record.fileName !== "string" || !record.fileName.trim() || typeof record.mimeType !== "string" || typeof record.bytes !== "number" || !Number.isFinite(record.bytes) || record.bytes < 0) return undefined;
    return { storageKey: record.storageKey, fileName: record.fileName, mimeType: record.mimeType, bytes: record.bytes };
}
