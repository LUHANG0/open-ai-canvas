import { describe, expect, test } from "bun:test";

import { assetForRemoteSync, projectConfirmedAssetMedia } from "@/lib/asset-remote-sync";
import type { Asset } from "@/stores/use-asset-store";

function imageAsset(primaryVersionId?: string): Asset {
    return {
        id: "asset-1",
        kind: "image",
        title: "测试素材",
        coverUrl: "opaque://asset",
        tags: [],
        primaryVersionId,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        data: { dataUrl: "opaque://asset", width: 1, height: 1, bytes: 1, mimeType: "image/png" },
    };
}

describe("asset remote sync", () => {
    test("removes an invalid historical primary version id only from the remote payload", () => {
        const source = imageAsset("generation-result:" + "x".repeat(40));

        const remote = assetForRemoteSync(source);

        expect(remote.primaryVersionId).toBeUndefined();
        expect(source.primaryVersionId).toBe("generation-result:" + "x".repeat(40));
        expect(remote).not.toBe(source);
    });

    test("preserves a valid backend version uuid", () => {
        const source = imageAsset("123e4567-e89b-12d3-a456-426614174000");

        expect(assetForRemoteSync(source)).toBe(source);
        expect(source.primaryVersionId).toBe("123e4567-e89b-12d3-a456-426614174000");
    });
});


test("uploaded media aliases are normalized before the remote asset write", () => {
    const source = { ...imageAsset(), metadata: { resourceKey: "image:owner:local" }, data: { ...(imageAsset() as import("@/stores/use-asset-store").ImageAsset).data, storageKey: "resource:uploaded" } } as Asset;
    expect(assetForRemoteSync(source).metadata?.resourceKey).toBe("resource:uploaded");
    expect(source.metadata?.resourceKey).toBe("image:owner:local");
});

test("confirmed uploads update only unchanged media references, preserving edits during upload", () => {
    const source = { ...imageAsset(), metadata: { resourceKey: "image:owner:local" }, data: { ...(imageAsset() as import("@/stores/use-asset-store").ImageAsset).data, storageKey: "image:owner:local" } } as Asset;
    const remote = { ...source, coverUrl: "/api/resources/uploaded/file", metadata: { resourceKey: "resource:uploaded" }, data: { ...(source as import("@/stores/use-asset-store").ImageAsset).data, storageKey: "resource:uploaded", dataUrl: "/api/resources/uploaded/file" } } as Asset;
    const current = { ...source, title: "edited during upload", tags: ["keep"], metadata: { ...source.metadata, note: "later" } };
    const projected = projectConfirmedAssetMedia(source, remote, current);
    expect(projected.id).toBe(source.id);
    expect(projected.title).toBe(current.title);
    expect(projected.tags).toEqual(["keep"]);
    expect(projected.metadata).toEqual({ resourceKey: "resource:uploaded", note: "later" });
    expect(projected.data).toEqual(remote.data);
    expect(projected.coverUrl).toBe(remote.coverUrl);
    expect(current.data).toEqual(source.data);
});

test("a media replacement made during upload is not overwritten by the older confirmation", () => {
    const source = imageAsset();
    const remote = { ...source, data: { ...(source as import("@/stores/use-asset-store").ImageAsset).data, storageKey: "resource:old", dataUrl: "/api/resources/old/file" } } as Asset;
    const current = { ...source, data: { ...(source as import("@/stores/use-asset-store").ImageAsset).data, storageKey: "image:new", dataUrl: "blob:new" } } as Asset;
    expect(projectConfirmedAssetMedia(source, remote, current)).toBe(current);
});
