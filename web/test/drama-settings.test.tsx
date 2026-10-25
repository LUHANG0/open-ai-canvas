import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageParameterFields } from "../src/components/image-parameter-fields";
import { ModelCapabilityEditor } from "../src/components/model-capability-editor";
import { VideoSettingsPanel } from "../src/components/video-settings-panel";
import { canvasThemes } from "../src/lib/canvas-theme";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { imageParameterRequest, resolveImageParameters, type ImageParameter } from "../src/lib/image-parameters";
import { createModelChannel, defaultConfig, encodeChannelModel } from "../src/stores/use-config-store";

const manifest = JSON.parse(readFileSync(new URL("../../plugin-packages/drama-api/manifest.json", import.meta.url), "utf8")) as { contributes: { providers: Array<{ id: string; imageParameters?: ImageParameter[] }> } };
const definitions = (id: string) => manifest.contributes.providers.find((p) => p.id === id)!.imageParameters!;

function fixture(protocol: string, model: string, capability: "image" | "video") {
    const profile = defaultModelCapabilityConfig(protocol, model);
    if (capability === "image") profile.image = resolveImageParameters(profile.image!, definitions(protocol), model);
    const channel = createModelChannel({ id: "drama", models: [model], modelCosts: [{ model, protocol, capability, capabilityConfig: profile, billingMode: "fixed_request", unitPriceMicrocredits: 1 }] });
    const selected = encodeChannelModel(channel.id, model);
    return { profile, config: { ...defaultConfig, channels: [channel], model: selected, imageModel: selected, videoModel: selected, quality: "medium", imageResolution: "4k", size: "16:9", count: "1", vquality: "4K", videoSeconds: "15" } };
}

describe("Drama generation controls share the plugin parameter contract", () => {
    test("GPT keeps resolution, frame and quality separate and renders only one response-format control", () => {
        const { profile, config } = fixture("drama-image", "gpt-image-2.5-sunburst", "image");
        const html = renderToStaticMarkup(<ImageParameterFields profile={profile.image!} config={config} onChange={() => {}} />);
        expect(html).toContain("分辨率");
        for (const tier of ["1K", "2K", "4K"]) expect(html).toContain(`>${tier}</button>`);
        expect(html).toContain("图像质量");
        expect(html).toContain("16:9");
        const values = imageParameterRequest(profile.image!, config, true)!;
        expect(values.imageResolution).toBe("4k");
        expect(values.quality).toBe("medium");
        const editor = renderToStaticMarkup(<ModelCapabilityEditor capability="image" section="protocol" protocol="drama-image" model="gpt-image-2.5-sunburst" value={profile} imageParameters={definitions("drama-image")} />);
        expect(editor).toContain("4K 支持的宽高比");
        expect(editor).not.toContain(">1.5K</button>");
        expect(editor).not.toContain("默认响应格式");
        expect(editor).not.toContain("是否向上游发送响应格式");
    });

    test("Gemini exposes resolution without an independent quality control", () => {
        const { profile, config } = fixture("drama-gemini-image", "gemini-3-pro-image", "image");
        const html = renderToStaticMarkup(<ImageParameterFields profile={profile.image!} config={config} onChange={() => {}} />);
        expect(html).toContain("分辨率");
        expect(html).toContain(">4K</button>");
        expect(html).not.toContain("图像质量");
        expect(imageParameterRequest(profile.image!, config, true)!.quality).toBeUndefined();
    });

    test("old Drama image configuration gains resolution while preserving administrator restrictions", () => {
        const { profile } = fixture("drama-image", "gpt-image-2.5-sunburst", "image");
        const image = profile.image!;
        image.parameters = image.parameters!.filter((p) => p.name !== "imageResolution").map((p) => p.name === "count" ? { ...p, max: 100 } : p.name === "size" ? { ...p, encoding: undefined, values: ["1:1", "16:9"], default: "16:9" } : p);
        image.size = { parameter: "aspect_ratio", values: ["1:1", "16:9"], default: "16:9", allowCustom: false, presets: [] };
        image.resolution = { supported: false, values: [], default: "auto" };
        const updated = resolveImageParameters(image, definitions("drama-image"), "gpt-image-2.5-sunburst");
        expect(updated.resolution.values).toEqual(["1k", "2k", "4k"]);
        expect(updated.maxOutputs).toBe(100);
        expect(updated.size.default).toBe("16:9");
        expect(updated.size.presets).toHaveLength(6);
        const reopened = resolveImageParameters(JSON.parse(JSON.stringify(updated)), definitions("drama-image"), "gpt-image-2.5-sunburst");
        expect(reopened).toEqual(updated);
    });

    test("A video settings retain 4K and Auto rather than applying legacy Seedance normalization", () => {
        const { config } = fixture("drama-seedance-a", "seedance2.0-A", "video");
        config.size = "Auto";
        const html = renderToStaticMarkup(<VideoSettingsPanel config={config} theme={canvasThemes.light} onConfigChange={() => {}} />);
        expect(html).toContain("分辨率");
        expect(html).toMatch(/aria-pressed="true"[^>]*>4K<\/button>/);
        expect(html).toContain("自动");
        expect(config.size).toBe("Auto");
        expect(html).not.toContain("生成声音");
        expect(html).not.toContain("添加水印");
    });

    test("2.5-A video only exposes its two resolutions and duration through 30 seconds", () => {
        const { config } = fixture("drama-seedance-a", "seedance2.5-A", "video");
        config.vquality = "720p"; config.videoSeconds = "30";
        const html = renderToStaticMarkup(<VideoSettingsPanel config={config} theme={canvasThemes.light} onConfigChange={() => {}} />);
        expect(html).toContain("480P");
        expect(html).toContain("720P");
        expect(html).not.toContain("1080P");
        expect(html).not.toContain(">4K<");
        expect(html).toContain('value="30"');
        expect(html).not.toContain("生成声音");
    });
});
