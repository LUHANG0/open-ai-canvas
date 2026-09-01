import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export const CANVAS_REPRO_PROJECT_ID = "canvas-p0-fixture";

const FIXTURE_TIME = "2026-09-01T00:00:00.000Z";

function fixtureNode(input: Pick<CanvasNodeData, "id" | "type" | "title" | "position" | "width" | "height" | "metadata">): CanvasNodeData {
    return {
        ...input,
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
    };
}

export function createCanvasReproProject(): CanvasProject {
    const nodes: CanvasNodeData[] = [
        fixtureNode({
            id: "canvas-p0-text-story",
            type: CanvasNodeType.Text,
            title: "故事梗概",
            position: { x: 80, y: 90 },
            width: 320,
            height: 210,
            metadata: {
                content: "雨夜车站，离家多年的女孩收到一封来自未来的信。",
                prompt: "雨夜车站，离家多年的女孩收到一封来自未来的信。",
                status: "success",
            },
        }),
        fixtureNode({
            id: "canvas-p0-text-shot",
            type: CanvasNodeType.Text,
            title: "镜头提示",
            position: { x: 80, y: 380 },
            width: 320,
            height: 190,
            metadata: {
                content: "中景缓慢推进，雨丝逆光可见，人物停在站台边缘。",
                prompt: "中景缓慢推进，雨丝逆光可见，人物停在站台边缘。",
                status: "success",
            },
        }),
        fixtureNode({
            id: "canvas-p0-image-reference",
            type: CanvasNodeType.Image,
            title: "主视觉参考",
            position: { x: 510, y: 90 },
            width: 360,
            height: 240,
            metadata: {
                content: "/short-drama-styles/suspense-noir.jpg",
                mimeType: "image/jpeg",
                naturalWidth: 1600,
                naturalHeight: 900,
                status: "success",
                assetTags: ["夜景", "电影感"],
            },
        }),
        fixtureNode({
            id: "canvas-p0-config",
            type: CanvasNodeType.Config,
            title: "视频生成",
            position: { x: 510, y: 400 },
            width: 420,
            height: 260,
            metadata: {
                generationMode: "video",
                prompt: "结合故事梗概和主视觉参考生成 5 秒电影感视频。",
                content: "结合故事梗概和主视觉参考生成 5 秒电影感视频。",
                status: "idle",
            },
        }),
    ];

    const connections: CanvasConnection[] = [
        {
            id: "canvas-p0-connection-story",
            fromNodeId: "canvas-p0-text-story",
            toNodeId: "canvas-p0-config",
        },
        {
            id: "canvas-p0-connection-image",
            fromNodeId: "canvas-p0-image-reference",
            toNodeId: "canvas-p0-config",
        },
    ];

    return {
        id: CANVAS_REPRO_PROJECT_ID,
        title: "画布 P0 验收夹具",
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
        nodes,
        connections,
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: true,
        viewport: { x: 120, y: 70, k: 0.9 },
        directorScenes: [],
    };
}
