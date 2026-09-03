import { describe, expect, test } from "bun:test";

import { videoRatioPreview } from "../src/components/video-settings-panel";

describe("video settings panel", () => {
    test("为所有标准及扩展画幅生成方向正确的预览", () => {
        expect(videoRatioPreview("16:9")).toEqual({ width: 16, height: 9 });
        expect(videoRatioPreview("3:2")).toEqual({ width: 3, height: 2 });
        expect(videoRatioPreview("2:3")).toEqual({ width: 2, height: 3 });
        expect(videoRatioPreview("4:5")).toEqual({ width: 4, height: 5 });
        expect(videoRatioPreview("1280x720")).toEqual({ width: 1280, height: 720 });
        expect(videoRatioPreview("adaptive")).toEqual({ width: 0, height: 0 });
    });
});
