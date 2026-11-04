import { afterAll, expect, mock, test } from "bun:test";
import type { AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import type { ImageAsset } from "@/stores/use-asset-store";
let scope = "account-a";
let uploadResult = { storageKey: "resource:uploaded", pendingRemoteUpload: false };
let uploads = 0;
let switchDuringRead = false;
const scopeModule = await import("../src/lib/user-scope");
mock.module("../src/lib/user-scope", () => ({ ...scopeModule, getActiveUserScope: () => scope }));
const storageModule = await import("../src/services/image-storage");
mock.module("../src/services/image-storage", () => ({
    ...storageModule,
    getImageBlob: async () => {
        if (switchDuringRead) scope = "account-b";
        return new Blob(["fixture"]);
    },
    uploadImage: async () => {
        uploads++;
        return uploadResult;
    },
}));
// The resolver uses the production resource-ID parser; UI dependencies are not mounted here.
const { resolveWorkbenchAsset, workbenchAssetDisabledReason } = await import("../src/pages/workbench/workbench-reference-library");
afterAll(() => mock.restore());
function item(storageKey = "resource:ready"): AssetLibraryPickerItem {
    const asset = { id: "asset", title: "角色参考", kind: "image", data: { storageKey, dataUrl: "", width: 1, height: 1, bytes: 1, mimeType: "image/png" }, tags: [], coverUrl: "", createdAt: "", updatedAt: "" } as ImageAsset;
    return { id: asset.id, title: asset.title, asset };
}
test("server resource references are reused without uploading bytes", async () => {
    scope = "account-a";
    uploads = 0;
    expect(await resolveWorkbenchAsset(item(), scope)).toEqual({ resourceId: "ready", kind: "image", name: "角色参考" });
    expect(uploads).toBe(0);
});
test("local-only images must finish remote upload before entering composer", async () => {
    scope = "account-a";
    uploads = 0;
    uploadResult = { storageKey: "resource:uploaded", pendingRemoteUpload: false };
    expect((await resolveWorkbenchAsset(item("image:local"), scope)).resourceId).toBe("uploaded");
    uploadResult = { storageKey: "image:pending", pendingRemoteUpload: true };
    await expect(resolveWorkbenchAsset(item("image:local"), scope)).rejects.toThrow("未能同步");
});
test("account switch during local read blocks the upload and old selection", async () => {
    scope = "account-a";
    uploads = 0;
    switchDuringRead = true;
    await expect(resolveWorkbenchAsset(item("image:local"), scope)).rejects.toThrow("账号已切换");
    expect(uploads).toBe(0);
    switchDuringRead = false;
});
test("archived and incompatible assets remain unavailable", () => {
    const asset = item().asset!;
    expect(workbenchAssetDisabledReason({ ...asset, status: "archived" }, ["image"])).toContain("恢复");
    expect(workbenchAssetDisabledReason(asset, ["video"])).toContain("视频");
});
