import { describe, expect, test } from "bun:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CanvasNodeContent, type CanvasNodeContentProps } from "../src/components/canvas/canvas-node-content";
import { resolveCanvasMediaRenderPolicy } from "../src/lib/canvas/canvas-performance-mode";
import { canvasThemes } from "../src/lib/canvas-theme";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const video: CanvasNodeData = {
    id: "playback-test",
    type: CanvasNodeType.Video,
    title: "播放测试视频",
    position: { x: 0, y: 0 },
    width: 420,
    height: 236,
    metadata: { content: "/test-video.mp4", previewContent: "/test-poster.jpg", mimeType: "video/mp4" },
};

function render(overrides: Partial<CanvasNodeContentProps> = {}) {
    return renderToStaticMarkup(createElement(CanvasNodeContent, {
        node: video,
        theme: canvasThemes.light,
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
        ...overrides,
    }));
}

describe("画布视频播放入口", () => {
    for (const mode of ["auto", "performance", "quality"] as const) {
        test(`${mode} 封面提供可聚焦的悬停与键盘播放入口，不渲染中央按钮或提前挂载播放器`, () => {
            const markup = render({
                videoPreviewOnly: true,
                mediaRenderPolicy: resolveCanvasMediaRenderPolicy(mode, [video], { viewportScale: 1, visibleNodes: [video] }),
            });
            expect(markup).toContain('role="group"');
            expect(markup).toContain('tabindex="0"');
            expect(markup).toContain('aria-label="播放测试视频，悬停播放，点击或按空格播放暂停"');
            expect(markup).toContain('data-canvas-video-preview="idle"');
            expect(markup).toContain('data-canvas-video-poster-status="ready"');
            expect(markup).toContain('src="/test-poster.jpg"');
            expect(markup).not.toContain("<video");
            expect(markup).not.toContain("data-canvas-video-poster-play");
            expect(markup).not.toContain("canvas-video-center-play");
        });
    }

    test("没有封面时仍保留悬停和键盘入口，不将空封面挂为播放器", () => {
        const markup = render({ node: { ...video, metadata: { content: "/test-video.mp4" } }, videoPreviewOnly: true });
        expect(markup).toContain('role="group"');
        expect(markup).toContain('tabindex="0"');
        expect(markup).toContain("悬停播放，点击或按空格播放暂停");
        expect(markup).toContain("data-canvas-video-lod");
        expect(markup).not.toContain("data-canvas-video-poster-play");
        expect(markup).not.toContain("<video");
    });

    test("普通选中只挂载带原声的暂停播放器，封面不会成为视频源或显示中央按钮", () => {
        const markup = render({ videoPreviewOnly: false });
        expect(markup).toContain("<video");
        expect(markup).toContain("/test-video.mp4");
        expect(markup).not.toContain("/test-poster.jpg");
        expect(markup).not.toContain("canvas-video-center-play");
        const videoTag = markup.match(/<video\b[^>]*>/)?.[0];
        expect(videoTag).toBeDefined();
        expect(videoTag).not.toMatch(/\b(?:autoplay|muted)(?:=|\s|>)/i);
    });

    test("未缓存的远程资源保留封面和可聚焦播放表面", () => {
        const markup = render({ node: { ...video, metadata: { ...video.metadata, storageKey: "resource:playback-test" } }, videoPreviewOnly: false });
        expect(markup).toContain('role="group"');
        expect(markup).toContain('tabindex="0"');
        expect(markup).toContain("悬停播放，点击或按空格播放暂停");
        expect(markup).toContain('src="/test-poster.jpg"');
        expect(markup).not.toContain("data-canvas-video-poster-play");
        expect(markup).not.toContain("<video");
    });

    test("显式禁止播放时保留封面并移出键盘顺序", () => {
        const markup = render({ videoPreviewOnly: false, videoPlaybackDisabled: true });
        expect(markup).toContain('tabindex="-1"');
        expect(markup).toContain("data-canvas-video-lod");
        expect(markup).not.toContain("<video");
    });
});
