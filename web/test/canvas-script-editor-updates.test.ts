import { describe, expect, test } from "bun:test";

import { canvasScriptUsesKeyframeVideos, updateCanvasScriptVisibleColumns } from "../src/pages/canvas/canvas-script-editor-updates";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const scriptNode: CanvasNodeData = {
    id: "script",
    type: CanvasNodeType.Script,
    title: "分镜脚本",
    position: { x: 0, y: 0 },
    width: 640,
    height: 420,
    metadata: {
        storyboard: {
            rows: [{ id: "shot-1", shotNumber: 1, durationSeconds: 5, plotDescription: "镜头一" }],
            visibleColumns: ["shotNumber", "plotDescription"],
            referenceNodeIds: ["character-1"],
        },
    },
};

describe("画布脚本编辑器装配", () => {
    test("切换可见列时保留分镜行与引用节点", () => {
        const next = updateCanvasScriptVisibleColumns([scriptNode], "script", ["shotNumber", "videoMotionPrompt"]);
        expect(next[0].metadata?.storyboard).toMatchObject({
            rows: scriptNode.metadata?.storyboard?.rows,
            visibleColumns: ["shotNumber", "videoMotionPrompt"],
            referenceNodeIds: ["character-1"],
        });
    });

    test("空列不写入，视频生成方式只由脚本节点模式决定", () => {
        expect(updateCanvasScriptVisibleColumns([scriptNode], "script", [])).toEqual([scriptNode]);
        expect(canvasScriptUsesKeyframeVideos(scriptNode)).toBe(false);
        expect(canvasScriptUsesKeyframeVideos({ ...scriptNode, metadata: { ...scriptNode.metadata, storyboardVideoInputMode: "keyframe" } })).toBe(true);
    });
});
