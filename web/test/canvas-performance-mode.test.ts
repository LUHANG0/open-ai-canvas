import { describe, expect, test } from "bun:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CanvasNodeContent } from "../src/components/canvas/canvas-node-content";
import { resolveCanvasMediaRenderPolicy, shouldMountCanvasVideoPlayer, shouldReduceCanvasMediaEffects, shouldReduceCanvasNodeMediaEffects } from "../src/lib/canvas/canvas-performance-mode";
import { canvasThemes } from "../src/lib/canvas-theme";
import { canvasVideoPosterCacheKey } from "../src/services/canvas-video-poster-cache";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, type: CanvasNodeType, content = type === CanvasNodeType.Video ? `${id}.mp4` : `${id}.png`): CanvasNodeData {
    return {
        id,
        type,
        title: id,
        position: { x: 0, y: 0 },
        width: 420,
        height: 236,
        metadata: { content },
    };
}

describe("canvas media performance mode", () => {
    test("手动质量和性能模式始终优先于自动策略", () => {
        const denseVideos = Array.from({ length: 8 }, (_, index) => node(`video-${index}`, CanvasNodeType.Video));

        expect(shouldReduceCanvasMediaEffects("quality", denseVideos, { viewportScale: 0.15, visibleNodes: denseVideos })).toBe(false);
        expect(shouldReduceCanvasMediaEffects("performance", [], { viewportScale: 1, visibleNodes: [] })).toBe(true);
    });

    test("三种模式映射到明确的图片、封面和特效策略", () => {
        const video = node("video", CanvasNodeType.Video);
        const auto = resolveCanvasMediaRenderPolicy("auto", [video], { viewportScale: 1, visibleNodes: [video] });
        const performance = resolveCanvasMediaRenderPolicy("performance", [video], { viewportScale: 1, visibleNodes: [video] });
        const quality = resolveCanvasMediaRenderPolicy("quality", [video], { viewportScale: 0.1, visibleNodes: [video] });

        expect(auto.tier).toBe("balanced");
        expect(auto.posterMaxWidth).toBe(960);
        expect(performance).toMatchObject({ tier: "lightweight", reduceEffects: true, preferImagePreview: true, posterMaxWidth: 480, posterConcurrency: 1 });
        expect(quality).toMatchObject({ tier: "quality", reduceEffects: false, preferImagePreview: false, posterMaxWidth: 1280, posterConcurrency: 2 });
    });

    test("视口和节点改变但展示档位不变时复用策略对象", () => {
        const videos = [node("video-a", CanvasNodeType.Video), node("video-b", CanvasNodeType.Video)];
        for (const mode of ["auto", "quality", "performance"] as const) {
            const before = resolveCanvasMediaRenderPolicy(mode, videos, { viewportScale: 1, visibleNodes: videos });
            const after = resolveCanvasMediaRenderPolicy(mode, [...videos], { viewportScale: 0.8, visibleNodes: videos.slice(0, 1) });
            expect(after).toBe(before);
        }
        const balanced = resolveCanvasMediaRenderPolicy("auto", videos, { viewportScale: 1, visibleNodes: videos });
        const lightweight = resolveCanvasMediaRenderPolicy("auto", videos, { viewportScale: 0.2, visibleNodes: videos });
        expect(lightweight).not.toBe(balanced);
        expect(lightweight.tier).toBe("lightweight");
        expect(resolveCanvasMediaRenderPolicy("auto", videos, { viewportScale: 0.3, visibleNodes: videos.slice(0, 1) })).toBe(lightweight);
        expect(resolveCanvasMediaRenderPolicy("auto", videos, { viewportScale: 1, visibleNodes: videos })).toBe(balanced);
    });

    test("超远景下只要有可见视频就开启轻量展示", () => {
        const video = node("video", CanvasNodeType.Video);

        expect(shouldReduceCanvasMediaEffects("auto", [video], { viewportScale: 0.36, visibleNodes: [video] })).toBe(true);
        expect(shouldReduceCanvasMediaEffects("auto", [video], { viewportScale: 0.7, visibleNodes: [video] })).toBe(false);
    });

    test("只统计当前可见媒体的密度，画布外的少量节点不误触发", () => {
        const nodes = Array.from({ length: 20 }, (_, index) => node(`image-${index}`, CanvasNodeType.Image));
        const visibleNodes = nodes.slice(0, 3);

        expect(shouldReduceCanvasMediaEffects("auto", nodes, { viewportScale: 1, visibleNodes })).toBe(false);
        expect(shouldReduceCanvasMediaEffects("auto", nodes, { viewportScale: 1, visibleNodes: nodes.slice(0, 18) })).toBe(true);
    });

    test("保留原有的全局大画布保护阈值", () => {
        const textNodes = Array.from({ length: 80 }, (_, index) => node(`text-${index}`, CanvasNodeType.Text, "text"));
        const mediaNodes = Array.from({ length: 32 }, (_, index) => node(`image-${index}`, CanvasNodeType.Image));

        expect(shouldReduceCanvasMediaEffects("auto", textNodes, { viewportScale: 1, visibleNodes: [] })).toBe(true);
        expect(shouldReduceCanvasMediaEffects("auto", mediaNodes, { viewportScale: 1, visibleNodes: [] })).toBe(true);
    });

    test("轻量模式不挂载完整视频播放器", () => {
        const video = node("video", CanvasNodeType.Video);
        const commonProps = {
            node: video,
            theme: canvasThemes.dark,
            isEditingContent: false,
            textareaRef: createRef<HTMLTextAreaElement>(),
            isBatchRoot: false,
            batchCount: 0,
            batchExpanded: false,
            batchOpening: false,
            batchRecovering: false,
            mentionReferences: [],
            onContentChange: () => undefined,
            onStopEditing: () => undefined,
        };

        const lightweight = renderToStaticMarkup(createElement(CanvasNodeContent, { ...commonProps, reduceMediaEffects: true }));
        const full = renderToStaticMarkup(createElement(CanvasNodeContent, { ...commonProps, reduceMediaEffects: false }));

        expect(lightweight).toContain("data-canvas-video-lod");
        expect(lightweight).not.toContain("<video");
        expect(full).toContain("data-canvas-video-lod");
        expect(full).toContain('data-canvas-video-frame="pending"');
        expect(full).toMatch(/data-canvas-video-cover[^>]*aria-hidden="false"[^>]*opacity:1/);
        expect(full).toContain("<video");
    });

    test("单选节点退出 LOD，多选与显式禁用仍保持轻量模式", () => {
        expect(shouldReduceCanvasNodeMediaEffects(true, { selected: false, selectionSize: 0 })).toBe(true);
        expect(shouldReduceCanvasNodeMediaEffects(true, { selected: true, selectionSize: 1 })).toBe(false);
        expect(shouldReduceCanvasNodeMediaEffects(true, { selected: true, selectionSize: 4 })).toBe(true);
        expect(shouldReduceCanvasNodeMediaEffects(true, { selected: true, selectionSize: 1, forced: true })).toBe(true);
    });

    test("播放器挂载与画质模式解耦，只允许唯一选中的视频加载", () => {
        expect(shouldMountCanvasVideoPlayer({ selected: false, selectionSize: 0 })).toBe(false);
        expect(shouldMountCanvasVideoPlayer({ selected: true, selectionSize: 1 })).toBe(true);
        expect(shouldMountCanvasVideoPlayer({ selected: true, selectionSize: 8 })).toBe(false);
        expect(shouldMountCanvasVideoPlayer({ selected: true, selectionSize: 1, forced: true })).toBe(false);
    });

    test("画质优先的未选中视频仍使用高清封面而不是批量播放器", () => {
        const video = node("video", CanvasNodeType.Video);
        const policy = resolveCanvasMediaRenderPolicy("quality", [video], { viewportScale: 1, visibleNodes: [video] });
        const markup = renderToStaticMarkup(
            createElement(CanvasNodeContent, {
                node: video,
                theme: canvasThemes.dark,
                isEditingContent: false,
                textareaRef: createRef<HTMLTextAreaElement>(),
                isBatchRoot: false,
                batchCount: 0,
                batchExpanded: false,
                batchOpening: false,
                batchRecovering: false,
                mentionReferences: [],
                onContentChange: () => undefined,
                onStopEditing: () => undefined,
                mediaRenderPolicy: policy,
                videoPreviewOnly: true,
            }),
        );

        expect(markup).toContain("data-canvas-video-lod");
        expect(markup).toContain("data-canvas-video-poster-status");
        expect(markup).not.toContain("<video");
        expect(markup).toContain("linear-gradient");
    });

    test("视频封面缓存键稳定并按素材隔离", () => {
        expect(canvasVideoPosterCacheKey("resource:a")).toBe(canvasVideoPosterCacheKey("resource:a"));
        expect(canvasVideoPosterCacheKey("resource:a")).not.toBe(canvasVideoPosterCacheKey("resource:b"));
    });

    test("性能优先只渲染一层静态封面，画质优先保留景深层", () => {
        const video = node("video", CanvasNodeType.Video);
        video.metadata = { ...video.metadata, previewContent: "data:image/png;base64,poster" };
        const commonProps = {
            node: video,
            theme: canvasThemes.dark,
            isEditingContent: false,
            textareaRef: createRef<HTMLTextAreaElement>(),
            isBatchRoot: false,
            batchCount: 0,
            batchExpanded: false,
            batchOpening: false,
            batchRecovering: false,
            mentionReferences: [],
            onContentChange: () => undefined,
            onStopEditing: () => undefined,
            videoPreviewOnly: true,
        };
        const performance = renderToStaticMarkup(createElement(CanvasNodeContent, {
            ...commonProps,
            mediaRenderPolicy: resolveCanvasMediaRenderPolicy("performance", [video], { viewportScale: 1, visibleNodes: [video] }),
        }));
        const quality = renderToStaticMarkup(createElement(CanvasNodeContent, {
            ...commonProps,
            mediaRenderPolicy: resolveCanvasMediaRenderPolicy("quality", [video], { viewportScale: 1, visibleNodes: [video] }),
        }));

        expect((performance.match(/<img/g) || []).length).toBe(1);
        expect((quality.match(/<img/g) || []).length).toBe(2);
        expect(performance).not.toContain("blur-xl");
        expect(quality).toContain("blur-xl");
    });
});
