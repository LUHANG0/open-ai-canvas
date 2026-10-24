import assert from "node:assert/strict";
import test from "node:test";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities.ts";

test("4SToken Gateway images keep edits while disabling automatic quality and resolution fields", () => {
    const image = defaultModelCapabilityConfig("4stoken-image").image!;
    assert.equal(image.references.maskSupported, true);
    assert.equal(image.size.default, "1024x1024");
    assert.equal(image.quality.supported, false);
    assert.equal(image.resolution.supported, false);
    assert.equal(image.responseFormat.supported, false);
});

test("4SToken Seedream uses native dimensions and reference limits", () => {
    const image = defaultModelCapabilityConfig("4stoken-seedream").image!;
    assert.equal(image.size.default, "2048x2048");
    assert.equal(image.references.maxImages, 14);
    assert.equal(image.references.maskSupported, false);
    assert.equal(image.quality.supported, false);
    assert.equal(image.maxOutputs, 15);
});

test("4SToken video leaves resolution and multimodal limits to channel configuration", () => {
    const video = defaultModelCapabilityConfig("4stoken-video").video!;
    assert.deepEqual(video.resolutions, []);
    assert.equal(video.defaultResolution, "");
    assert.deepEqual(video.generateAudio, { supported: true, default: false });
    assert.deepEqual(video.watermark, { supported: true, default: true });
    assert.ok(video.operations.includes("reference_to_video"));
    assert.ok(video.operations.includes("audio_to_video"));
    assert.equal(video.references.maxVideos, 0);
    assert.equal(video.references.maxAudios, 0);
});
