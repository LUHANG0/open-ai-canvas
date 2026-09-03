import { describe, expect, test } from "bun:test";
import { applyArchivedAssetIds, buildLinkedFolderPreviewNodes, resolveLinkedFolderAppearance } from "../src/pages/canvas/use-canvas-linked-project-assets";
import type { ProjectAsset, ProjectAssetFolder } from "../src/services/api/projects";
import type { Asset } from "../src/stores/use-asset-store";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, content: string, assetId?: string): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content, assetId } };
}

function projectAsset(patch: Partial<ProjectAsset> & Pick<ProjectAsset, "id" | "folderId" | "mediaType">): ProjectAsset {
    return {
        title: patch.id,
        category: "other",
        status: "ready",
        versionCount: 1,
        usages: [],
        position: 0,
        updatedAt: "2026-09-02T00:00:00.000Z",
        ...patch,
    };
}

describe("画布关联项目素材", () => {
    test("旧版或未知文件夹外观使用稳定的兼容默认值", () => {
        expect(resolveLinkedFolderAppearance({ style: "cinema", theme: "ember" } as ProjectAssetFolder)).toEqual({ style: "cinema", theme: "ember" });
        expect(resolveLinkedFolderAppearance({ style: "legacy", theme: "legacy" } as ProjectAssetFolder)).toEqual({ style: "glass", theme: "aurora" });
    });

    test("归档完成后只更新内容仍与提交快照一致的节点", () => {
        const unchanged = node("unchanged", "old-image", "old-asset");
        const editedWhileSaving = node("edited", "new-image", "old-asset");
        const current = [unchanged, editedWhileSaving];
        const next = applyArchivedAssetIds(
            current,
            new Map([
                ["unchanged", { assetId: "archived-1", content: "old-image", previousAssetId: "old-asset" }],
                ["edited", { assetId: "archived-2", content: "old-image", previousAssetId: "old-asset" }],
            ]),
        );

        expect(next[0].metadata?.assetId).toBe("archived-1");
        expect(next[1]).toBe(editedWhileSaving);
    });

    test("项目文件夹预览优先复用本地素材内容并按媒体类型建节点", () => {
        const localVideo: Asset = {
            id: "video-1",
            kind: "video",
            title: "本地视频",
            coverUrl: "",
            tags: [],
            createdAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
            data: { url: "blob:video-preview", width: 1280, height: 720, bytes: 10, mimeType: "video/mp4" },
        };
        const previews = buildLinkedFolderPreviewNodes(
            [localVideo],
            [projectAsset({ id: "video-1", folderId: "folder-1", mediaType: "video" }), projectAsset({ id: "text-1", folderId: "folder-1", mediaType: "text", previewText: "场景描述" })],
        );

        expect(previews.get("folder-1")?.map((item) => item.type)).toEqual([CanvasNodeType.Video, CanvasNodeType.Text]);
        expect(previews.get("folder-1")?.[0].metadata?.content).toBe("blob:video-preview");
        expect(previews.get("folder-1")?.[1].metadata?.content).toBe("场景描述");
    });
});
