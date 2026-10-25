import assert from "node:assert/strict";
import test from "node:test";
import { imageResponseFormatField, imageSettingDescription, imageSettingLabel, imageSettingOption, imageSettingOrder, settingsAspectLabel, settingsImageResolutionLabel, settingsVideoResolutionLabel } from "../src/lib/generation-settings-presentation.ts";
import type { ImageParameter } from "../src/lib/image-parameters.ts";

const field = (name: string, patch: Partial<ImageParameter> = {}): ImageParameter => ({ name, label: "自定义标题", type: "string", ...patch });

test("known quality labels use Chinese display without changing the enum or its type", () => {
    const quality = field("quality");
    for (const [value, label] of [["low", "低"], ["medium", "中"], ["high", "高"], ["xhigh", "超高"], ["max", "最高"], ["auto", "自动"]]) assert.equal(imageSettingOption(quality, value), label);
    assert.equal(imageSettingOption(quality, "special-v2"), "special-v2");
    assert.equal(imageSettingOption(quality, 0), "0");
    assert.equal(quality.name, "quality");
});

test("identical words in unrelated custom fields remain opaque", () => {
    for (const name of ["finish", "customMode", "speed", "responseFormat"]) for (const value of ["low", "medium", "high", "max", "auto", "url", "b64_json"]) assert.equal(imageSettingOption(field(name), value), value);
    assert.equal(imageSettingLabel(field("finish", { label: "表面效果" })), "表面效果");
});

test("resolution and quality remain distinct capabilities", () => {
    assert.equal(imageSettingLabel(field("quality", { values: ["low", "high"] })), "图像质量");
    assert.equal(imageSettingLabel(field("quality", { values: ["1k", "1.5k", "2k"] })), "分辨率");
    for (const value of ["small", "large", "high", "provider-resolution"]) assert.equal(settingsImageResolutionLabel(value), value);
    assert.equal(settingsImageResolutionLabel("1.5k"), "1.5K");
    assert.equal(settingsImageResolutionLabel("auto"), "自动");
});

test("only an identified response-format field translates URL/data/auto and belongs to advanced settings", () => {
    const response = field("responseFormat", { binding: "providerOptions.fixture.response_format" });
    assert.equal(imageResponseFormatField(response), true);
    assert.equal(imageResponseFormatField(field("response_format")), true);
    assert.equal(imageResponseFormatField(field("responseFormat")), false);
    assert.equal(imageResponseFormatField(field("finish", { binding: "other.quality" })), false);
    for (const [value, label] of [["url", "图片链接"], ["b64_json", "图片数据"], ["auto", "自动"], ["custom-output", "custom-output"]]) assert.equal(imageSettingOption(response, value), label);
});

test("aspect labels describe only declared values and distinguish auto from adaptive", () => {
    for (const [value, label] of [["16:9", "横屏 16:9"], ["9:16", "竖屏 9:16"], ["1:1", "方形 1:1"], ["1280x720", "横屏 1280x720"], ["Auto", "自动"], ["adaptive", "自适应"], ["provider-wide", "provider-wide"]]) assert.equal(settingsAspectLabel(value), label);
});

test("video resolution display never turns auto into a concrete guessed resolution", () => {
    assert.equal(settingsVideoResolutionLabel("Auto"), "自动");
    assert.equal(settingsVideoResolutionLabel("adaptive"), "自适应");
    assert.equal(settingsVideoResolutionLabel("1080p"), "1080P");
    assert.equal(settingsVideoResolutionLabel("4K"), "4K");
    assert.equal(settingsVideoResolutionLabel("768p竖"), "768P竖");
});

test("display order changes a copied list without mutating the schema, selected values or pricing flags", () => {
    const fields = [field("responseFormat"), field("count", { type: "integer", min: 1, max: 8 }), field("quality", { pricing: true }), field("size"), field("imageResolution"), field("transparentBackground", { type: "boolean" })];
    const before = JSON.stringify(fields);
    const sorted = [...fields].sort((a, b) => imageSettingOrder(a) - imageSettingOrder(b));
    assert.deepEqual(sorted.map((entry) => entry.name), ["size", "imageResolution", "quality", "count", "transparentBackground", "responseFormat"]);
    assert.equal(JSON.stringify(fields), before);
});

test("custom descriptions and important limits remain visible even on host fields", () => {
    for (const name of ["size", "imageResolution", "quality", "count", "responseFormat", "custom"]) {
        const value = field(name, { description: "仅本模型支持，最多2张；当前档位不可使用透明背景。" });
        assert.equal(imageSettingDescription(value), value.description);
    }
});

test("only exact built-in protocol prose is rewritten, retaining the high-tier availability restriction", () => {
    assert.equal(imageSettingDescription(field("quality", { description: "low / medium / high 为质量；xhigh / max 仅适用于平台明确开放的 GPT 2.5 线路。" })), "超高、最高仅限当前线路明确支持时使用。");
    assert.equal(imageSettingDescription(field("imageResolution", { description: "仅用于画幅到像素尺寸的换算，不向上游发送 resolution。" })), "用于画幅与像素尺寸的换算。");
    assert.equal(imageSettingDescription(field("imageResolution", { description: "1K / 2K / 4K 分别映射为平台的 quality=low / medium / high。" })), "1K、2K、4K对应当前模型支持的清晰度档位。");
    assert.equal(imageSettingDescription(field("quality", { description: "xhigh / max 仅适用于我的专用线路；最多3张。" })), "xhigh / max 仅适用于我的专用线路；最多3张。");
});
