import { useMemo } from "react";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { ASSET_CATEGORY_LABELS, normalizeAssetCategory } from "@/lib/asset-category";
import { getActiveUserScope } from "@/lib/user-scope";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

export type PickedWorkbenchReference = { resourceId: string; kind: "image" | "video" | "audio"; name: string };
type MediaKind = PickedWorkbenchReference["kind"];

export function workbenchAssetDisabledReason(asset: Asset, accept: readonly MediaKind[]) {
    if (asset.status === "archived") return "请先从回收站恢复这个素材";
    if ((asset.kind === "image" || asset.kind === "video" || asset.kind === "audio") && accept.includes(asset.kind)) return undefined;
    return `请选择${accept.map((kind) => ({ image: "图片", video: "视频", audio: "音频" })[kind]).join("、")}`;
}

export async function resolveWorkbenchAsset(item: AssetLibraryPickerItem, scope: string): Promise<PickedWorkbenchReference> {
    const assertScope = () => {
        if (getActiveUserScope() !== scope) throw new Error("账号已切换，请重新选择素材");
    };
    assertScope();
    const asset = item.asset;
    if (!asset || (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") || asset.status === "archived") throw new Error(`“${item.title}”不能作为参考素材`);
    const kind = asset.kind;
    const id = resourceIdFromStorageKey(asset.data.storageKey);
    if (id) return { resourceId: id, kind, name: item.title };
    if (kind !== "image") throw new Error(`“${item.title}”尚未同步，请先在素材库完成同步`);
    if (asset.kind !== "image") throw new Error("仅图片支持在此同步");
    const blob = asset.data.storageKey ? await getImageBlob(asset.data.storageKey) : null;
    assertScope();
    const source = blob || asset.data.dataUrl || asset.coverUrl;
    if (!source) throw new Error(`“${item.title}”的图片文件不可用`);
    const uploaded = await uploadImage(source);
    assertScope();
    const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
    if (uploaded.pendingRemoteUpload || !resourceId) throw new Error(`“${item.title}”未能同步到服务器，请重试`);
    return { resourceId, kind, name: item.title };
}

export function WorkbenchReferenceLibrary({
    open,
    accept,
    remaining,
    slotName,
    onClose,
    onPick,
}: {
    open: boolean;
    accept: readonly MediaKind[];
    remaining: number;
    slotName?: string;
    onClose: () => void;
    onPick: (items: PickedWorkbenchReference[]) => Promise<void>;
}) {
    const assets = useAssetStore((state) => state.assets);
    const items = useMemo<AssetLibraryPickerItem[]>(
        () =>
            assets
                .filter((asset) => ["image", "video", "audio"].includes(asset.kind))
                .map((asset) => ({
                    id: asset.id,
                    title: asset.title,
                    asset,
                    category: normalizeAssetCategory(asset.category),
                    archived: asset.status === "archived",
                    kindLabel: ({ image: "图片", video: "视频", audio: "音频" } as Record<string, string>)[asset.kind],
                    searchText: (asset.tags || []).join(" "),
                    disabledReason: workbenchAssetDisabledReason(asset, accept),
                })),
        [accept, assets],
    );
    return (
        <AssetLibraryPickerModal
            remoteLibrary
            acceptRemoteItems
            open={open}
            items={items}
            remoteKind={accept.length === 1 ? accept[0] : undefined}
            remoteItemDisabledReason={(asset) => workbenchAssetDisabledReason(asset, accept)}
            mediaKinds={[...accept]}
            multiple={remaining > 1}
            categoryLabels={{ all: "全部素材", ...ASSET_CATEGORY_LABELS }}
            title={slotName ? `选择${slotName}` : "选择参考素材"}
            eyebrow="我的素材"
            emptyDescription="可以先在素材库保存角色、场景或参考画面，再在这里选用。"
            footerNote={`还可添加 ${Math.max(0, remaining)} 个素材；仅保存在本机的图片会先同步到服务器。`}
            confirmLabel={(count) => `使用所选素材${count ? `（${count}）` : ""}`}
            onClose={onClose}
            onConfirm={async (ids, selectedItems) => {
                if (!ids.length) throw new Error("请选择素材");
                if (ids.length > remaining) throw new Error(`最多再选 ${Math.max(0, remaining)} 个素材，请取消多选的项目`);
                const pool = new Map([...items, ...(selectedItems || [])].map((item) => [item.id, item]));
                const selected = ids.map((id) => pool.get(id));
                if (selected.some((item) => !item?.asset)) throw new Error("素材列表已变化，请刷新后重选");
                for (const item of selected) {
                    const reason = workbenchAssetDisabledReason(item!.asset!, accept);
                    if (reason) throw new Error(reason);
                }
                const scope = getActiveUserScope();
                const resolved = await Promise.all(selected.map((item) => resolveWorkbenchAsset(item!, scope)));
                if (scope !== getActiveUserScope()) throw new Error("账号已切换，请重新选择素材");
                await onPick(resolved);
                onClose();
            }}
        />
    );
}
