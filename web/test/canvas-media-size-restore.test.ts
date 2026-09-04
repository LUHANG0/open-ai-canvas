import { describe, expect, test } from "bun:test";

import { NODE_DEFAULT_SIZE } from "../src/constant/canvas";
import { ensureMediaNodeMinimumSize } from "../src/lib/canvas/canvas-node-size";
import { resetInterruptedGeneration } from "../src/lib/canvas/canvas-project-generation";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function mediaNode(type: CanvasNodeType.Image | CanvasNodeType.Video, overrides: Partial<CanvasNodeData> = {}): CanvasNodeData {
    return {
        id: `media-${type}`,
        type,
        title: "素材",
        position: { x: -250.5, y: 983.25 },
        width: 840,
        height: 560,
        metadata: { content: "https://example.com/media", naturalWidth: 1200, naturalHeight: 800 },
        ...overrides,
    };
}

describe("媒体恢复保留用户布局", () => {
    for (const type of [CanvasNodeType.Image, CanvasNodeType.Video] as const) {
        for (const flag of ["manualSize", "freeResize", "locked"] as const) {
            test(`${type} 的 ${flag} 保留超大、小尺寸和竖向布局`, () => {
                for (const size of [{ width: 840, height: 560 }, { width: 240, height: 160 }, { width: 360, height: 900 }]) {
                    const node = mediaNode(type, { ...size, metadata: { ...mediaNode(type).metadata, [flag]: true } });
                    expect(ensureMediaNodeMinimumSize(node)).toBe(node);
                    expect(ensureMediaNodeMinimumSize(JSON.parse(JSON.stringify(node)))).toEqual(node);
                }
            });
        }

        test(`${type} 手工空节点刷新不回到默认占位尺寸`, () => {
            const node = mediaNode(type, { width: 240, height: 160, metadata: { manualSize: true } });
            expect(ensureMediaNodeMinimumSize(node)).toBe(node);
        });

        test(`${type} 自动尺寸仍限制范围并保持中心位置`, () => {
            const node = mediaNode(type);
            const restored = ensureMediaNodeMinimumSize(node);
            expect(restored.width).toBe(720);
            expect(restored.height).toBe(480);
            expect(restored.position).toEqual({ x: -190.5, y: 1023.25 });
            expect(node.width).toBe(840);
            expect(ensureMediaNodeMinimumSize(restored)).toBe(restored);
        });

        test(`${type} 未手工调整的空节点仍补齐默认占位`, () => {
            const node = mediaNode(type, { width: 100, height: 100, metadata: {} });
            const restored = ensureMediaNodeMinimumSize(node);
            expect(restored.width).toBe(NODE_DEFAULT_SIZE[type].width);
            expect(restored.height).toBe(NODE_DEFAULT_SIZE[type].height);
        });

        test(`${type} 旧标题归一化不改动手工几何`, () => {
            const node = mediaNode(type, { title: type === CanvasNodeType.Image ? "New Generation" : "Video", metadata: { manualSize: true } });
            const restored = ensureMediaNodeMinimumSize(node);
            expect(restored).toEqual({ ...node, title: type === CanvasNodeType.Image ? "图片" : "视频" });
            expect(restored.position).toBe(node.position);
        });
    }

    test("已手工调整的图生图节点不再按生成比例校正", () => {
        const node = mediaNode(CanvasNodeType.Image, {
            width: 600,
            height: 500,
            metadata: { content: "https://example.com/image", generationType: "edit", size: "1:1", naturalWidth: 1600, naturalHeight: 900, manualSize: true },
        });
        expect(ensureMediaNodeMinimumSize(node)).toBe(node);
        const automatic = ensureMediaNodeMinimumSize({ ...node, metadata: { ...node.metadata, manualSize: false } });
        expect(automatic.width).toBe(500);
        expect(automatic.height).toBe(281.25);
    });

    test("项目生成恢复仍恢复任务状态但保留手工视频几何", () => {
        const image = mediaNode(CanvasNodeType.Image, { metadata: { manualSize: true } });
        const video = mediaNode(CanvasNodeType.Video, { height: 840 * 496 / 864, metadata: { manualSize: true, status: "loading" } });
        const [restoredImage, restoredVideo] = resetInterruptedGeneration([image, video]);
        expect(restoredImage).toBe(image);
        expect(restoredVideo).toEqual({ ...video, metadata: { ...video.metadata, errorDetails: "正在从任务中心恢复生成状态..." } });
        expect(restoredVideo.position).toBe(video.position);
    });
});
