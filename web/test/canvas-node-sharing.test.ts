import { describe, expect, test } from "bun:test";
import { resourceFileUrl } from "../src/services/api/resources";
import { resolveCanvasNodeCopySource, resolveCanvasNodeMediaURL } from "../src/pages/canvas/use-canvas-node-sharing";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function canvasNode(type: CanvasNodeType, metadata: CanvasNodeData["metadata"]): CanvasNodeData {
    return { id: "node-1", type, title: "测试节点", x: 0, y: 0, width: 320, height: 180, metadata };
}

describe("画布节点分享", () => {
    test("复制内容优先使用节点正文，并为资源图片回退到鉴权文件地址", () => {
        expect(resolveCanvasNodeCopySource(canvasNode(CanvasNodeType.Text, { content: "  分镜正文  " }))).toBe("分镜正文");
        expect(resolveCanvasNodeCopySource(canvasNode(CanvasNodeType.Image, { storageKey: "resource:image-1" }))).toBe(resourceFileUrl("image-1"));
        expect(resolveCanvasNodeCopySource(canvasNode(CanvasNodeType.Video, { storageKey: "resource:video-1" }))).toBe("");
    });

    test("媒体地址支持远程内容，并让本地 Blob 回退到持久资源", () => {
        const baseURL = "https://canvas.example/workspace";
        expect(resolveCanvasNodeMediaURL(canvasNode(CanvasNodeType.Video, { content: "/media/video.mp4" }), baseURL)).toBe("https://canvas.example/media/video.mp4");
        expect(resolveCanvasNodeMediaURL(canvasNode(CanvasNodeType.Image, { content: "blob:temporary", storageKey: "resource:image-2" }), baseURL)).toBe(new URL(resourceFileUrl("image-2"), baseURL).toString());
        expect(resolveCanvasNodeMediaURL(canvasNode(CanvasNodeType.Image, { content: "data:image/png;base64,abc" }), baseURL)).toBe("");
    });
});
