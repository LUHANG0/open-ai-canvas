import { saveAs } from "file-saver";
import { readZip } from "@/lib/zip";
import { MediaPackage } from "@/lib/media-package";
import { parseAssetRecordList } from "@/lib/asset-record";
import { createClientUUID } from "@/lib/client-id";
import { getActiveUserScope } from "@/lib/user-scope";
import { isResourceUrl } from "@/services/api/resources";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { captureUploadScope } from "@/services/upload-scope";
import type { Asset } from "@/stores/use-asset-store";
import type { CanvasExportAsset } from "@/types/canvas-export";

type AssetExportFile = { app: "yingce"; version: 1; exportedAt: string; assets: Asset[]; files: CanvasExportAsset[] };

export async function exportAssets(assets: Asset[]): Promise<void> {
    const { assertCurrent } = captureUploadScope();
    const media = assets.filter((asset) => ["image", "video", "audio", "model"].includes(asset.kind));
    const images = new Set<string>();
    const keys: string[] = [];
    for (const asset of media) {
        if (!("storageKey" in asset.data) || typeof asset.data.storageKey !== "string" || !asset.data.storageKey) continue;
        keys.push(asset.data.storageKey);
        if (asset.kind === "image") images.add(asset.data.storageKey);
    }
    const archive = new MediaPackage();
    const manifest: AssetExportFile = { app: "yingce", version: 1, assets, exportedAt: new Date().toISOString(), files: await archive.collect(keys, "files", images) };
    assertCurrent();
    const packagedKeys = new Set(manifest.files.map((file) => file.storageKey));
    if (keys.some((key) => !packagedKeys.has(key))) throw new Error("素材包缺少媒体：部分文件暂时无法读取，请重试导出");
    const file = await archive.finish("assets.json", manifest);
    assertCurrent();
    saveAs(file, "我的素材.zip");
}

export async function readAssetPackage(file: File): Promise<Asset[]> {
    const { assertCurrent } = captureUploadScope();
    const scope = getActiveUserScope();
    const archive = await readZip(file);
    const manifestBlob = archive.get("assets.json");
    if (!manifestBlob) throw new Error("素材包缺少 assets.json");
    const manifest: unknown = JSON.parse(await manifestBlob.text());
    if (
        !manifest ||
        typeof manifest !== "object" ||
        !("app" in manifest) ||
        manifest.app !== "yingce" ||
        !("version" in manifest) ||
        manifest.version !== 1 ||
        !("assets" in manifest) ||
        !Array.isArray(manifest.assets) ||
        !("files" in manifest) ||
        !Array.isArray(manifest.files)
    )
        throw new Error("素材包格式或版本不受支持");
    const assets = parseAssetRecordList(manifest.assets);
    const images = new Set<string>();
    for (const asset of assets) {
        if (asset.kind === "image" && typeof asset.data.storageKey === "string") images.add(asset.data.storageKey);
    }
    // Validate the whole manifest before making the first persistent write.
    const writes = manifest.files.map((entry: unknown) => {
        if (
            !entry ||
            typeof entry !== "object" ||
            !("storageKey" in entry) ||
            typeof entry.storageKey !== "string" ||
            !entry.storageKey ||
            !("path" in entry) ||
            typeof entry.path !== "string" ||
            !("mimeType" in entry) ||
            typeof entry.mimeType !== "string"
        )
            throw new Error("素材包文件索引无效");
        const blob = archive.get(entry.path);
        if (!blob) throw new Error(`素材包缺少文件：${entry.path}`);
        if ("bytes" in entry && entry.bytes !== blob.size) throw new Error(`素材包文件大小不匹配：${entry.path}`);
        return { key: entry.storageKey, blob: blob.slice(0, blob.size, entry.mimeType) };
    });
    const keys = new Set(writes.map(({ key }) => key));
    if (keys.size !== writes.length) throw new Error("素材包包含重复文件索引");
    for (const asset of assets) {
        if (asset.kind === "text" || asset.kind === "entity") continue;
        if (asset.data.storageKey && !keys.has(asset.data.storageKey)) throw new Error(`素材包缺少媒体：${asset.title}`);
        const url = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
        if (!asset.data.storageKey && (isResourceUrl(url) || url.startsWith("blob:"))) throw new Error(`素材包缺少媒体：${asset.title}`);
    }
    const importedMedia = new Map<string, { storageKey: string; url: string }>();
    for (const { key, blob } of writes) {
        assertCurrent();
        const kind = images.has(key) || key.startsWith("image:") ? "image" : blob.type.startsWith("video/") ? "video" : blob.type.startsWith("audio/") ? "audio" : "file";
        // Fresh, account-scoped keys enter the normal upload/sync path instead of
        // priming another account's resource cache under its original ID.
        const storageKey = `${kind}:${scope}:${createClientUUID()}`;
        const url = await (kind === "image" ? setImageBlob(storageKey, blob) : setMediaBlob(storageKey, blob));
        assertCurrent();
        importedMedia.set(key, { storageKey, url });
    }
    assertCurrent();
    for (const asset of assets) {
        delete asset.folderId;
        delete asset.primaryVersionId;
        if (asset.kind === "entity") {
            // These fields are read-only projections of the source character
            // version, not a transferable target-account media binding.
            asset.data = { definition: asset.data.definition };
            asset.coverUrl = "";
            continue;
        }
        if (asset.kind === "text") {
            if (isResourceUrl(asset.coverUrl)) asset.coverUrl = "";
            continue;
        }
        const media = asset.data.storageKey ? importedMedia.get(asset.data.storageKey) : undefined;
        if (!media) continue;
        asset.data.storageKey = media.storageKey;
        if (asset.kind === "image") asset.data.dataUrl = media.url;
        else asset.data.url = media.url;
        asset.coverUrl = asset.kind === "image" ? media.url : "";
    }
    return assets;
}
