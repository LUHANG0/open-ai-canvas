import { describe, expect, test } from "bun:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CanvasNodeContent } from "../src/components/canvas/canvas-node-content";
import { shouldReduceCanvasMediaEffects, shouldReduceCanvasNodeMediaEffects } from "../src/lib/canvas/canvas-performance-mode";
import { canvasThemes } from "../src/lib/canvas-theme";
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
        expect(full).not.toContain("data-canvas-video-lod");
        expect(full).toContain("<video");
    });

    test("单选节点退出 LOD，多选与显式禁用仍保持轻量模式", () => {
        expect(shouldReduceCanvasNodeMediaEffects(true, { selected: false, selectionSize: 0 })).toBe(true);
        expect(shouldReduceCanvasNodeMediaEffects(true, { selected: true, selectionSize: 1 })).toBe(false);
        expect(shouldReduceCanvasNodeMediaEffects(true, { selected: true, selectionSize: 4 })).toBe(true);
        expect(shouldReduceCanvasNodeMediaEffects(true, { selected: true, selectionSize: 1, forced: true })).toBe(true);
    });
});
