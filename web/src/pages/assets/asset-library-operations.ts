import { getActiveUserScope } from "@/lib/user-scope";
import { listRemoteAssetsPage } from "@/services/api/user-data";
import { deleteAssetsWithRemoteSync, loadAssetsForUse, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { flushAssetStorePersistence, useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";

const batchSize = 100;

export function captureAssetLibraryAccount(userId: string) {
    const scope = getActiveUserScope();
    const assertCurrent = () => {
        if ((useUserStore.getState().user?.id || "") !== userId || getActiveUserScope() !== scope) throw new Error("账号已切换，请重新操作素材库");
    };
    assertCurrent();
    return assertCurrent;
}

export async function collectAssetLibraryIds(status: "active" | "archived", userId: string) {
    const assertCurrent = captureAssetLibraryAccount(userId);
    if (!userId)
        return useAssetStore
            .getState()
            .assets.filter((asset) => (asset.status === "archived") === (status === "archived"))
            .map((asset) => asset.id);
    await flushAssetStorePersistence();
    assertCurrent();
    await saveRemoteUserDataNow([]);
    assertCurrent();
    const ids = new Set<string>();
    for (let page = 1; ; page++) {
        const result = await listRemoteAssetsPage({ page, pageSize: batchSize, status });
        assertCurrent();
        for (const asset of result.assets) ids.add(asset.id);
        if (!result.hasMore) return [...ids];
        if (!result.assets.length) throw new Error("素材分页结果不完整，请刷新后重试");
    }
}

export async function loadAssetLibraryExport(status: "active" | "archived", userId: string) {
    const assertCurrent = captureAssetLibraryAccount(userId);
    const ids = await collectAssetLibraryIds(status, userId);
    assertCurrent();
    if (!ids.length) return [];
    await loadAssetsForUse(ids);
    assertCurrent();
    const byId = new Map(useAssetStore.getState().assets.map((asset) => [asset.id, asset]));
    return ids.map((id) => {
        const asset = byId.get(id);
        if (!asset) throw new Error("部分素材不存在或无权访问，请重新导出素材");
        return asset;
    });
}

export async function deleteAllArchivedAssets(userId: string, onDeleted: (count: number) => void) {
    const assertCurrent = captureAssetLibraryAccount(userId);
    // Fix the complete collection before deleting: paging a shrinking trash
    // collection by offset would skip records after the first batch.
    const ids = await collectAssetLibraryIds("archived", userId);
    assertCurrent();
    let deleted = 0;
    for (let offset = 0; offset < ids.length; offset += batchSize) {
        assertCurrent();
        const batch = ids.slice(offset, offset + batchSize);
        await deleteAssetsWithRemoteSync(batch);
        deleted += batch.length;
        onDeleted(deleted);
    }
    return deleted;
}
