import type { Asset } from "@/stores/use-asset-store";

const PRIMARY_VERSION_ID_MAX_LENGTH = 36;
type MediaAsset = Extract<Asset, { kind: "image" | "video" | "audio" }>;
const isMediaAsset = (asset: Asset): asset is MediaAsset => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio";

export function assetForRemoteSync(asset: Asset): Asset {
    const primaryVersionId = asset.primaryVersionId?.trim();
    let remote = asset;
    if (primaryVersionId && [...primaryVersionId].length > PRIMARY_VERSION_ID_MAX_LENGTH) {
        const { primaryVersionId: _invalidPrimaryVersionId, ...rest } = asset;
        remote = rest as Asset;
    }
    if (isMediaAsset(remote) && remote.data.storageKey?.startsWith("resource:") && /^(image|video|audio|file):/.test(String(remote.metadata?.resourceKey || ""))) {
        remote = { ...remote, metadata: { ...remote.metadata, resourceKey: remote.data.storageKey } };
    }
    return remote;
}

/** Confirm only the media fields prepared by this upload; concurrent user edits remain dirty. */
export function projectConfirmedAssetMedia(source: Asset, remote: Asset, current: Asset): Asset {
    if (!isMediaAsset(source) || !isMediaAsset(remote) || !isMediaAsset(current) || source.kind !== remote.kind || source.kind !== current.kind || !remote.data.storageKey?.startsWith("resource:")) return current;
    const field = source.kind === "image" ? "dataUrl" : "url";
    const before = source.data as { storageKey?: string; dataUrl?: string; url?: string };
    const after = remote.data as typeof before;
    const live = current.data as typeof before;
    if (live.storageKey !== before.storageKey || live[field] !== before[field]) return current;
    const metadata = current.metadata?.resourceKey === source.metadata?.resourceKey && remote.metadata?.resourceKey !== source.metadata?.resourceKey
        ? { ...current.metadata, resourceKey: remote.metadata?.resourceKey }
        : current.metadata;
    const coverUrl = current.coverUrl === source.coverUrl ? remote.coverUrl : current.coverUrl;
    if (live.storageKey === after.storageKey && live[field] === after[field] && metadata === current.metadata && coverUrl === current.coverUrl) return current;
    return { ...current, metadata, coverUrl, data: { ...current.data, storageKey: after.storageKey, [field]: after[field] } } as Asset;
}
