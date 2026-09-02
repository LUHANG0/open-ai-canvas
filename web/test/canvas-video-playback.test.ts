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
        test(`${mode} 封面包含真正的播放按钮，不提前挂载播放器`, () => {
            const markup = render({
                videoPreviewOnly: true,
                mediaRenderPolicy: resolveCanvasMediaRenderPolicy(mode, [video], { viewportScale: 1, visibleNodes: [video] }),
            });
            expect(markup).toMatch(/<button[^>]*data-canvas-video-poster-play[^>]*aria-label="播放视频"/);
            expect(markup).toContain("color:#fff");
            expect(markup).toContain("background-color:rgba(0, 0, 0, 0.68)");
            expect(markup).toContain("z-20");
            expect(markup).toContain('src="/test-poster.jpg"');
            expect(markup).not.toContain("<video");
            expect(markup).not.toContain("选中播放");
        });
    }

    test("没有封面或封面生成失败时也可直接播放", () => {
        const markup = render({ node: { ...video, metadata: { content: "/test-video.mp4" } }, videoPreviewOnly: true });
        expect(markup).toContain('aria-label="播放视频"');
        expect(markup).not.toContain("<video");
    });

    test("普通选中只挂载暂停播放器，封面不会成为视频源", () => {
        const markup = render({ videoPreviewOnly: false });
        expect(markup).toContain("<video");
        expect(markup).toContain("/test-video.mp4");
        expect(markup).not.toContain("/test-poster.jpg");
        expect(markup).not.toContain(" autoplay=");
    });

    test("未缓存的远程资源保留封面和播放入口，不再要求先加载再播放", () => {
        const markup = render({ node: { ...video, metadata: { ...video.metadata, storageKey: "resource:playback-test" } }, videoPreviewOnly: false });
        expect(markup).toContain("data-canvas-video-poster-play");
        expect(markup).toContain('src="/test-poster.jpg"');
        expect(markup).not.toContain("加载视频（保持暂停）");
        expect(markup).not.toContain("<video");
    });
});
