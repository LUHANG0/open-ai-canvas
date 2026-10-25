import assert from "node:assert/strict";
import test from "node:test";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities.ts";
import { modelPickerVideoDescription } from "../src/lib/model-picker-description.ts";

function profile() {
    const video = defaultModelCapabilityConfig().video!;
    Object.assign(video, { resolutions: ["720p"], duration: { selection: "range", min: 4, max: 15, step: 1, default: 5 } });
    return video;
}

test("only complete shorthand matching structured counts, resolutions and duration is deduplicated", () => {
    const video = profile();
    assert.equal(modelPickerVideoDescription("503，720p，4–15s", { maxImages: 5, maxVideos: 0, maxAudios: 3 }, video), "");
    assert.equal(modelPickerVideoDescription("900，720p，15s", { maxImages: 9, maxVideos: 0, maxAudios: 0 }, video), "");
});

test("free prose, unknown number formats and conflicting capabilities remain visible", () => {
    const video = profile();
    const references = { maxImages: 5, maxVideos: 0, maxAudios: 3 };
    for (const text of ["推荐：503，720p，4–15s", "900，720p，15s", "503，1080p，15s", "503，720p，30s", "30-0-10，720p，15s", "900 积分 / 次"]) {
        assert.equal(modelPickerVideoDescription(text, references, video), text);
    }
});

test("partial resolution descriptions are not hidden when the model supports more output tiers", () => {
    const video = profile(); video.resolutions = ["720p", "1080p"];
    assert.equal(modelPickerVideoDescription("503，720p，15s", { maxImages: 5, maxAudios: 3 }, video), "503，720p，15s");
});
