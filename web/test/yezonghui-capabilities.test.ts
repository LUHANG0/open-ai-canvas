import assert from "node:assert/strict";
import test from "node:test";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities.ts";

test("Yezonghui async image configuration exposes only supported capabilities", () => {
    const profile = defaultModelCapabilityConfig("yezonghui-image").image!;
    assert.equal(profile.references.maskSupported, false);
    assert.equal(profile.maxOutputs, 1);
    assert.equal(profile.size.parameter, "aspect_ratio");
    assert.equal(profile.resolution.supported, true);
    assert.deepEqual(profile.resolution.values, []);
    assert.equal(profile.resolution.default, "");
    for (const field of [profile.quality, profile.transparentBackground, profile.outputFormat, profile.responseFormat]) {
        assert.equal(field.supported, false);
    }
});

test("Yezonghui video requires configured resolution and keeps audio opt-in", () => {
    const profile = defaultModelCapabilityConfig("yezonghui-video").video!;
    assert.deepEqual(profile.resolutions, []);
    assert.equal(profile.defaultResolution, "");
    assert.deepEqual(profile.generateAudio, { supported: true, default: false });
    assert.equal(profile.watermark.supported, false);
    assert.ok(profile.operations.includes("reference_to_video"));
    assert.ok(profile.operations.includes("audio_to_video"));
    assert.equal(profile.references.maxVideos, 0);
    assert.equal(profile.references.maxAudios, 0);
});
