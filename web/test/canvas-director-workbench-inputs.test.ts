import { describe, expect, test } from "bun:test";

import { selectCanvasDirectorImageNodes } from "../src/pages/canvas/canvas-director-workbench-inputs";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, type: CanvasNodeType, content?: string): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content } };
}

describe("画布 3D 导演台输入", () => {
    test("只提供已有内容的图片节点", () => {
        const readyImage = node("ready-image", CanvasNodeType.Image, "blob:image");
        const nodes = [readyImage, node("empty-image", CanvasNodeType.Image), node("video", CanvasNodeType.Video, "blob:video")];
        expect(selectCanvasDirectorImageNodes(nodes)).toEqual([readyImage]);
    });
});
