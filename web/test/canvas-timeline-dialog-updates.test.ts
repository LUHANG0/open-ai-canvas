import { describe, expect, test } from "bun:test";

import { syncSavedCanvasSubtitles } from "../src/pages/canvas/canvas-timeline-dialog-updates";
import type { TimelineProject } from "../src/types/timeline";

const timeline: TimelineProject = {
    version: 2,
    tracks: [],
    clips: [
        {
            id: "clip-video",
            kind: "video",
            nodeId: "video-node",
            trackId: "video",
            startMs: 2_000,
            durationMs: 5_000,
            title: "视频",
            sourceStartMs: 0,
            sourceDurationMs: 5_000,
        },
    ],
    durationMs: 7_000,
};

describe("画布时间线弹窗保存", () => {
    test("项目尚无时间线时不创建隐式时间线", () => {
        expect(syncSavedCanvasSubtitles(null, "video-node", { subtitleEntries: [] })).toBeNull();
    });

    test("保存字幕时按视频片段起点同步字幕轨", () => {
        const next = syncSavedCanvasSubtitles(timeline, "video-node", {
            subtitleEntries: [{ index: 1, startMs: 500, endMs: 1_500, text: "第一句" }],
        });
        expect(next?.clips.find((clip) => clip.kind === "subtitle")).toMatchObject({ nodeId: "video-node", startMs: 2_500, durationMs: 1_000, text: "第一句" });
        expect(timeline.clips).toHaveLength(1);
    });
});
