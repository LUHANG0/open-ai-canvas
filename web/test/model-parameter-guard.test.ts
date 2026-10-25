import assert from "node:assert/strict";
import test from "node:test";
import { createModelSwitchCoordinator, mediaParameterChanges, planMediaParameters } from "../src/lib/model-parameter-guard.ts";
import { defaultModelCapabilityConfig, modelCapabilityConfigFor } from "../src/lib/model-capabilities.ts";
import type { AiConfig } from "../src/stores/use-config-store.ts";

const planMediaModelSwitch = (config: AiConfig, model: string, mode: "image" | "video") => planMediaParameters(config, model, mode, modelCapabilityConfigFor(config, model));

function fixture() {
    const profile = defaultModelCapabilityConfig();
    Object.assign(profile.image!, {
        size: { parameter: "aspect_ratio", values: ["1:1", "9:16", "16:9"], default: "1:1", allowCustom: false },
        quality: { supported: true, values: ["auto", "high"], default: "auto" },
        resolution: { supported: true, values: ["1k", "2k"], default: "1k" },
        transparentBackground: { supported: true, default: false }, maxOutputs: 4,
    });
    Object.assign(profile.video!, {
        ratios: ["16:9", "9:16"], defaultRatio: "16:9", resolutions: ["720p", "1080p"], defaultResolution: "1080p",
        duration: { selection: "enum", values: [5, 10, 15], default: 5 },
        generateAudio: { supported: true, default: true }, watermark: { supported: true, default: false },
    });
    const config = {
        model: "test::a", size: "9:16", quality: "high", imageResolution: "2k", imageParameters: "{}", count: "2", transparentBackground: "true",
        videoSeconds: "10", vquality: "720", videoGenerateAudio: "false", videoWatermark: "true",
        channels: [{ id: "test", models: ["a", "b", "c"], modelCosts: ["a", "b", "c"].map((model) => ({ model, capabilityConfig: structuredClone(profile) })) }],
    } as AiConfig;
    return { config, target: config.channels[0].modelCosts![1].capabilityConfig! };
}

test("compatible image switch preserves selected ratio, resolution, quality, count and transparency instead of target defaults", () => {
    const { config } = fixture();
    const result = planMediaModelSwitch(config, "test::b", "image");
    assert.deepEqual(result.changes, []);
    for (const key of ["size", "quality", "imageResolution", "count", "transparentBackground"] as const) assert.equal(result.config[key], config[key]);
    assert.equal(config.model, "test::a");
});

test("compatible video switch preserves duration, ratio, semantic resolution and audio/watermark choices", () => {
    const { config } = fixture();
    const result = planMediaModelSwitch(config, "test::b", "video");
    assert.deepEqual(result.changes, []);
    assert.equal(result.config.size, "9:16");
    assert.equal(result.config.videoSeconds, "10");
    assert.equal(result.config.vquality, "720p");
    assert.equal(result.config.videoGenerateAudio, "false");
    assert.equal(result.config.videoWatermark, "true");
});

test("incompatible video plan discloses every actual ratio, resolution, duration and boolean change", () => {
    const { config, target } = fixture();
    Object.assign(target.video!, { ratios: ["16:9"], resolutions: ["1080p"], duration: { selection: "enum", values: [5], default: 5 }, generateAudio: { supported: false, default: true }, watermark: { supported: false, default: false } });
    const result = planMediaModelSwitch(config, "test::b", "video");
    assert.deepEqual(result.changes.map((item) => [item.before, item.after]), [["9:16", "16:9"], ["720P", "1080P"], ["10 秒", "5 秒"], ["关闭", "开启"], ["开启", "关闭"]]);
    assert.equal(config.size, "9:16");
});

test("pixel dimensions are not collapsed into aspect ratio or silently moved to the first same-ratio tier", () => {
    const { config, target } = fixture();
    config.size = "1024x1024";
    target.image!.size = { parameter: "size", values: ["2048x2048", "1024x1024"], default: "2048x2048", allowCustom: false };
    assert.equal(planMediaModelSwitch(config, "test::b", "image").config.size, "1024x1024");
    target.image!.size.values = ["2048x2048"];
    assert.deepEqual(planMediaModelSwitch(config, "test::b", "image").changes[0], { label: "画幅 / 输出尺寸", before: "1024x1024", after: "2048x2048" });
});

test("equivalent ratio tokens may match while actual pixel dimensions remain distinct", () => {
    const { config, target } = fixture();
    config.size = "2:2";
    assert.equal(planMediaModelSwitch(config, "test::b", "image").config.size, "1:1");
    assert.deepEqual(mediaParameterChanges({ size: "2:2", vquality: "720" }, { size: "1:1", vquality: "720p" }, "video"), []);
    assert.equal(mediaParameterChanges({ size: "1024x1024" }, { size: "2048x2048" }, "image").length, 1);
    target.image!.size.values = ["1:1"];
});

test("an automatic resolution is not treated as an explicitly selected 720p tier", () => {
    const changes = mediaParameterChanges({ vquality: "auto" }, { vquality: "720p" }, "video");
    assert.deepEqual(changes, [{ label: "分辨率", before: "auto", after: "720P" }]);
});

test("image changes include resolution, quality, count and transparency when the target cannot preserve them", () => {
    const { config, target } = fixture();
    Object.assign(target.image!, { quality: { supported: true, values: ["auto"], default: "auto" }, resolution: { supported: true, values: ["1k"], default: "1k" }, maxOutputs: 1, transparentBackground: { supported: false, default: false } });
    const result = planMediaModelSwitch(config, "test::b", "image");
    assert.deepEqual(result.changes.map((change) => change.label), ["分辨率", "质量", "生成数量", "透明背景"]);
});

function coordinatorFixture() {
    let state = { model: "a" };
    const coordinator = createModelSwitchCoordinator();
    const pending: Array<() => void> = [];
    let commits = 0;
    let stale = 0;
    const request = (model: string, compatible = false) => coordinator.request({
        read: () => state,
        plan: () => ({ changes: compatible ? [] : [{ label: "画幅", before: "9:16", after: "16:9" }], apply: () => { state = { model }; commits++; } }),
        confirm: (_, accept) => { pending.push(accept); }, stale: () => { stale++; },
    });
    return { coordinator, pending, request, state: () => state, commits: () => commits, stale: () => stale, externalUpdate: () => { state = { model: "external" }; } };
}

test("confirmation leaves state unchanged until acceptance; acceptance commits once", () => {
    const f = coordinatorFixture();
    assert.equal(f.request("b"), false);
    assert.equal(f.state().model, "a");
    assert.equal(f.commits(), 0);
    f.pending[0](); f.pending[0]();
    assert.equal(f.state().model, "b");
    assert.equal(f.commits(), 1);
});

test("cancel invalidates pending confirmation and preserves model and parameters", () => {
    const f = coordinatorFixture();
    f.request("b"); f.coordinator.invalidate(); f.pending[0]();
    assert.equal(f.state().model, "a"); assert.equal(f.commits(), 0);
});

test("rapid A to B to C ignores old confirmations and commits the latest once", () => {
    const f = coordinatorFixture();
    f.request("b"); f.request("c"); f.pending[0]();
    assert.equal(f.commits(), 0);
    f.pending[1](); f.pending[1]();
    assert.equal(f.state().model, "c"); assert.equal(f.commits(), 1);
});

test("a compatible later selection invalidates an older pending incompatible selection", () => {
    const f = coordinatorFixture();
    f.request("b"); assert.equal(f.request("c", true), true); f.pending[0]();
    assert.equal(f.state().model, "c"); assert.equal(f.commits(), 1);
});

test("asynchronous node or catalog replacement prevents a stale confirmation from overwriting newer settings", () => {
    const f = coordinatorFixture();
    f.request("b"); f.externalUpdate(); f.pending[0]();
    assert.equal(f.state().model, "external"); assert.equal(f.commits(), 0); assert.equal(f.stale(), 1);
});
