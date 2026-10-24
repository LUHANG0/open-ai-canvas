import assert from "node:assert/strict";
import test from "node:test";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities.ts";

test("Drama images expose documented JSON fields and disable unsupported editing controls", () => {
    const image = defaultModelCapabilityConfig("drama-image").image!;
    assert.equal(image.references.maskSupported, false);
    assert.equal(image.size.default, "1:1");
    assert.equal(image.quality.supported, true);
    assert.equal(image.resolution.supported, true);
    assert.deepEqual(image.resolution.values, ["1k", "2k", "4k"]);
    assert.equal(image.size.presets?.find((p) => p.tier === "4k" && p.ratio === "16:9")?.size, "3840x2160");
    assert.equal(image.outputFormat.supported, false);
    assert.equal(image.transparentBackground.supported, false);
    assert.equal(image.maxOutputs, 128);
});

test("Drama A versions have distinct duration, resolution, ratio and reference limits", () => {
    const standard = defaultModelCapabilityConfig("drama-seedance-a", "seedance2.0-A").video!;
    const newer = defaultModelCapabilityConfig("drama-seedance-a", "seedance2.5-A").video!;
    assert.equal(standard.duration.min, 4);
    assert.equal(standard.duration.max, 15);
    assert.equal(newer.duration.max, 30);
    assert.ok(standard.resolutions.includes("4K"));
    assert.ok(standard.ratios.includes("Auto"));
    assert.deepEqual(newer.resolutions, ["480p", "720p"]);
    assert.ok(!newer.ratios.includes("Auto"));
    assert.deepEqual([standard.references.maxImages, standard.references.maxVideos, standard.references.maxAudios], [9, 3, 3]);
    assert.deepEqual([newer.references.maxImages, newer.references.maxVideos, newer.references.maxAudios], [30, 10, 10]);
    for (const video of [standard, newer]) {
        assert.equal(video.generateAudio.supported, false);
        assert.equal(video.watermark.supported, false);
    }
});

test("Drama Fast and Mini require explicit model-specific capabilities", () => {
    for (const model of ["seedance2.0-fast-A", "seedance2.0-Mini-A"]) {
        const video = defaultModelCapabilityConfig("drama-seedance-a", model).video!;
        assert.deepEqual(video.resolutions, []);
        assert.equal(video.defaultResolution, "");
        assert.equal(video.references.maxImages, 0);
        assert.equal(video.references.maxVideos, 0);
        assert.equal(video.references.maxAudios, 0);
    }
});
