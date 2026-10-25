import { describe, expect, test } from "bun:test";
import { buildGenerationConfig, runBackendCanvasGenerationTask } from "../src/lib/canvas/canvas-project-generation";
import { applyNodeConfigPatch } from "../src/lib/canvas/canvas-project-domain";
import { canvasExplicitMediaParameters, canvasGenerationParameterError, canvasModelSwitchPatch } from "../src/lib/canvas/canvas-model-parameter-guard";
import { readNodeGenerationSpec } from "../src/lib/canvas/generation-contract";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { planMediaModelSwitch } from "../src/lib/model-selection";
import { createModelChannel, defaultConfig } from "../src/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function fixture(mode: "image" | "video") {
    const profile = defaultModelCapabilityConfig();
    profile.image!.size = { parameter: "aspect_ratio", values: ["1:1", "9:16", "16:9"], default: "1:1", allowCustom: false };
    profile.image!.maxOutputs = 4;
    Object.assign(profile.video!, { ratios: ["16:9", "9:16"], defaultRatio: "16:9", resolutions: ["720p", "1080p"], defaultResolution: "1080p", duration: { selection: "enum", values: [5, 10], default: 5 }, generateAudio: { supported: true, default: true }, watermark: { supported: true, default: false } });
    const channel = createModelChannel({ id: "guard", name: "guard", models: ["a", "b"], modelCosts: ["a", "b"].map((model) => ({ model, capability: mode, billingMode: "fixed_request", unitPriceMicrocredits: 1, capabilityConfig: structuredClone(profile) })) });
    const config = { ...defaultConfig, channels: [channel], models: ["guard::a", "guard::b"], imageModels: mode === "image" ? ["guard::a", "guard::b"] : [], videoModels: mode === "video" ? ["guard::a", "guard::b"] : [], imageModel: "guard::a", videoModel: "guard::a", model: "guard::a", size: "9:16", count: "2", videoSeconds: "10", vquality: "720", videoGenerateAudio: "false", videoWatermark: "true" };
    const node: CanvasNodeData = { id: "fixture", type: mode === "image" ? CanvasNodeType.Image : CanvasNodeType.Video, title: "fixture", position: { x: 0, y: 0 }, width: 400, height: 400, metadata: { model: config.model, size: "9:16", prompt: "keep prompt", composerContent: "keep prompt", count: mode === "image" ? 2 : undefined, seconds: mode === "video" ? "10" : undefined, vquality: "720", generateAudio: "false", watermark: "true", arkPrivateAssetUpload: "false", content: "existing-media", status: "success" } };
    return { config, node, target: channel.modelCosts![1].capabilityConfig! };
}

describe("canvas model parameter boundary", () => {
    for (const mode of ["image", "video"] as const) {
        test(`${mode}: accepted compatible parameters survive the existing domain reset and canonical contract`, () => {
            const { config, node } = fixture(mode);
            const current = { ...buildGenerationConfig(config, node, mode, undefined, true), ...canvasExplicitMediaParameters(node, mode) };
            const proposed = planMediaModelSwitch(current, "guard::b", mode);
            expect(proposed.changes).toEqual([]);
            const patch = canvasModelSwitchPatch(node, proposed.config, mode);
            expect(patch).not.toHaveProperty("content");
            expect(patch).not.toHaveProperty("status");
            const next = applyNodeConfigPatch(node, patch);
            expect(next.metadata?.size).toBe("9:16");
            expect(next.metadata?.prompt).toBe("keep prompt");
            expect(next.metadata?.content).toBe("existing-media");
            expect(next.metadata?.status).toBe("success");
            expect(next.metadata?.arkPrivateAssetUpload).toBe("false");
            expect(readNodeGenerationSpec(next)?.modelSelection).toEqual({ kind: "channel", channelId: "guard", modelKey: "b" });
            if (mode === "video") {
                expect(next.metadata?.seconds).toBe("10");
                expect(next.metadata?.generateAudio).toBe("false");
                expect(next.metadata?.watermark).toBe("true");
            }
            expect(() => buildGenerationConfig(config, next, mode)).not.toThrow();
        });

        test(`${mode}: catalog changes cannot silently normalize a stored ratio on submit`, () => {
            const { config, node } = fixture(mode);
            const selected = config.channels[0].modelCosts![0].capabilityConfig!;
            if (mode === "video") selected.video!.ratios = ["16:9"];
            else { selected.image!.size.values = ["1:1"]; selected.image!.size.default = "1:1"; }
            const display = buildGenerationConfig(config, node, mode, undefined, true);
            expect(canvasGenerationParameterError(node, mode, display)).toContain("9:16 →");
            expect(() => buildGenerationConfig(config, node, mode)).toThrow("确认调整后再生成");
            expect(node.metadata?.size).toBe("9:16");
        });
    }

    for (const mode of ["image", "video"] as const) test(`${mode}: final canvas task boundary rejects unconfirmed raw parameters before creating a task`, async () => {
        const { config } = fixture(mode);
        const selected = config.channels[0].modelCosts![0].capabilityConfig!;
        if (mode === "video") selected.video!.ratios = ["16:9"];
        else { selected.image!.size.values = ["1:1"]; selected.image!.size.default = "1:1"; }
        let creates = 0;
        await expect(runBackendCanvasGenerationTask({ projectId: "fixture", nodeId: "fixture", mode, prompt: "fixture", config }, {
            createTask: async () => { creates++; throw new Error("must not create"); },
            waitTask: async () => { throw new Error("must not wait"); }, createId: () => "fixture",
        })).rejects.toThrow("确认调整后再生成");
        expect(creates).toBe(0);
    });
});
