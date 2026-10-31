import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import * as images from "@/services/image-storage";
import * as media from "@/services/file-storage";
import { createZip } from "@/lib/zip";
import { setActiveUserScope } from "@/lib/user-scope";
import { exportAssets, readAssetPackage } from "@/pages/assets/asset-transfer";
import type { Asset } from "@/stores/use-asset-store";

const image: Asset = {
    id: "source-image",
    kind: "image",
    title: "Portrait",
    coverUrl: "/api/resources/source/file",
    folderId: "source-folder",
    primaryVersionId: "source-version",
    tags: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    data: { dataUrl: "/api/resources/source/file", storageKey: "resource:source", width: 10, height: 10, bytes: 3, mimeType: "image/png" },
};
const writes = new Map<string, Blob>();
let originalWindow: PropertyDescriptor | undefined;
let imageSpy: ReturnType<typeof spyOn>;
let mediaSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) } } });
    setActiveUserScope("target-user");
    writes.clear();
    const store = async (key: string, blob: Blob) => {
        writes.set(key, blob);
        return `blob:${key}`;
    };
    imageSpy = spyOn(images, "setImageBlob").mockImplementation(store);
    mediaSpy = spyOn(media, "setMediaBlob").mockImplementation(store);
});

afterEach(() => {
    imageSpy.mockRestore();
    mediaSpy.mockRestore();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as { window?: unknown }).window;
});

async function zip(assets: Asset[], files = [{ storageKey: "resource:source", path: "files/image", mimeType: "image/png", bytes: 3 }]) {
    return new File(
        [
            await createZip([
                { name: "assets.json", data: JSON.stringify({ app: "yingce", version: 1, assets, files }) },
                { name: "files/image", data: "png" },
            ]),
        ],
        "assets.zip",
    );
}

test("import replaces source account references and shares one new blob across duplicate media", async () => {
    const result = await readAssetPackage(await zip([image, { ...image, id: "duplicate" }]));
    const imported = result[0]!;
    expect(imported.kind).toBe("image");
    if (imported.kind !== "image") throw new Error("wrong kind");
    expect(imported.data.storageKey).toStartWith("image:target-user:");
    expect(result[1]!.data).toEqual(imported.data);
    expect(imported.data.dataUrl).toBe(`blob:${imported.data.storageKey}`);
    expect(imported.coverUrl).toBe(imported.data.dataUrl);
    expect(imported.folderId).toBeUndefined();
    expect(imported.primaryVersionId).toBeUndefined();
    expect(writes.size).toBe(1);
    expect(await writes.get(imported.data.storageKey!)!.text()).toBe("png");
    expect(image.data.storageKey).toBe("resource:source");
    const again = await readAssetPackage(await zip([image]));
    expect(again[0]!.data).not.toEqual(imported.data);
});

test.each(["video", "audio", "model"] as const)("import rebuilds %s bytes in target storage", async (kind) => {
    const asset = { ...image, kind, data: { url: "/api/resources/source/file", storageKey: "resource:source", width: 10, height: 10, bytes: 3, mimeType: kind === "model" ? "model/gltf-binary" : `${kind}/mp4`, fileName: "model.glb" } } as Asset;
    const result = await readAssetPackage(await zip([asset], [{ storageKey: "resource:source", path: "files/image", mimeType: asset.data.mimeType, bytes: 3 }]));
    expect(result[0]!.data).toMatchObject({ storageKey: expect.stringContaining(":target-user:"), url: expect.stringContaining("blob:") });
    expect(result[0]!.coverUrl).toBe("");
    expect(imageSpy).not.toHaveBeenCalled();
    expect(mediaSpy).toHaveBeenCalledTimes(1);
});

test("missing source media rejects before any persistent write", async () => {
    const missing = { ...image, id: "missing", data: { ...image.data, storageKey: "resource:missing" } } as Asset;
    await expect(readAssetPackage(await zip([image, missing]))).rejects.toThrow("素材包缺少媒体");
    expect(writes.size).toBe(0);
});

test("export reports missing media instead of downloading an incomplete portable package", async () => {
    const read = spyOn(images, "getImageBlob").mockResolvedValue(null);
    try {
        await expect(exportAssets([image])).rejects.toThrow("素材包缺少媒体");
    } finally {
        read.mockRestore();
    }
});

test("invalid late manifest entry rejects before any persistent write", async () => {
    const file = await zip(
        [image],
        [
            { storageKey: "resource:source", path: "files/image", mimeType: "image/png", bytes: 3 },
            { storageKey: "other", path: "missing", mimeType: "image/png", bytes: 3 },
        ],
    );
    await expect(readAssetPackage(file)).rejects.toThrow("素材包缺少文件");
    expect(writes.size).toBe(0);
});

test("account switch during file reading cancels before persisting media", async () => {
    const file = await zip([image]);
    const pending = readAssetPackage(file);
    setActiveUserScope("other-user");
    await expect(pending).rejects.toThrow("账号已切换");
    expect(writes.size).toBe(0);
});

test("character import preserves definition but drops source-only version display fields", async () => {
    const entity: Asset = { ...image, kind: "entity", data: { definition: { role: "hero" }, version: 4, coverStorageKey: "resource:source", voiceSampleStorageKey: "resource:voice", visualStatus: "ready", voiceStatus: "ready" } };
    const result = await readAssetPackage(await zip([entity], []));
    expect(result[0]!.data).toEqual({ definition: { role: "hero" } });
    expect(result[0]!.coverUrl).toBe("");
    expect(result[0]!.primaryVersionId).toBeUndefined();
});

test("account switch during a storage write stops subsequent writes and record creation", async () => {
    const file = await zip(
        [image],
        [
            { storageKey: "resource:source", path: "files/image", mimeType: "image/png", bytes: 3 },
            { storageKey: "other", path: "files/image", mimeType: "image/png", bytes: 3 },
        ],
    );
    imageSpy.mockImplementation(async (key: string, blob: Blob) => {
        writes.set(key, blob);
        setActiveUserScope("other-user");
        return "blob:old-user";
    });
    await expect(readAssetPackage(file)).rejects.toThrow("账号已切换");
    expect([...writes.keys()][0]).toStartWith("image:target-user:");
    expect(writes.size).toBe(1);
    expect(mediaSpy).not.toHaveBeenCalled();
});
