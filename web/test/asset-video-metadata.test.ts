import { describe, expect, test } from "bun:test";

import { formatAssetDimensions, mergeLoadedVideoMetadata } from "../src/pages/assets/video-metadata";

describe("素材视频元数据修复", () => {
    test("用浏览器已读取的媒体信息补齐 0x0 和未知时长", () => {
        expect(mergeLoadedVideoMetadata({ width: 0, height: 0, durationMs: undefined, url: "video.mp4" }, { width: 1920, height: 1080, durationMs: 5_120 })).toEqual({
            width: 1920,
            height: 1080,
            durationMs: 5_120,
            url: "video.mp4",
        });
    });

    test("不覆盖已有有效媒体信息", () => {
        expect(mergeLoadedVideoMetadata({ width: 1280, height: 720, durationMs: 4_000 }, { width: 1920, height: 1080, durationMs: 5_120 })).toBeNull();
    });

    test("未知尺寸不再展示为 0x0", () => {
        expect(formatAssetDimensions(0, 0)).toBe("尺寸待识别");
        expect(formatAssetDimensions(1920, 1080)).toBe("1920x1080");
    });
});
