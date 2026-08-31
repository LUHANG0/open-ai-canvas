import { describe, expect, test } from "bun:test";

import { modelQuoteRequest, normalizeTierResolution, priceTiersForCurrentSelection, requestCreditCost, requestCreditPricing } from "../src/lib/model-pricing";
import type { ModelRequirements } from "../src/lib/model-selection";
import { createModelChannel, defaultConfig, normalizeConfigSnapshot, resolveModelChannel, type AiConfig } from "../src/stores/use-config-store";

function systemConfig(input: {
    capability?: "image" | "video";
    logicalModelId?: string;
    tiers: Array<{
        selector: Record<string, string>;
        billingMode: "fixed_request" | "per_second" | "token";
        unitPriceMicrocredits: number;
        inputTokenPriceMicrocredits?: number;
        outputTokenPriceMicrocredits?: number;
        cachedTokenPriceMicrocredits?: number;
    }>;
}) {
    const capability = input.capability || "video";
    const model = capability === "video" ? "agnes-video-2.5" : "image-model";
    const channel = createModelChannel({
        id: "system-channel",
        name: "系统渠道",
        scope: "system",
        baseUrl: "/api/system-channel",
        apiKey: "system",
        apiFormat: "openai",
        models: [model],
        modelCosts: [
            {
                model,
                capability,
                pricePolicy: "channel",
                billingMode: input.tiers[0]?.billingMode || "fixed_request",
                unitPriceMicrocredits: input.tiers[0]?.unitPriceMicrocredits || 0,
                logicalModelId: input.logicalModelId,
                logicalPriceTiers: input.tiers.map((tier) => ({
                    ...tier,
                    resolution: tier.selector.vquality || "*",
                    videoSeconds: Number(tier.selector.videoSeconds || 0),
                    inputTokenPriceMicrocredits: tier.inputTokenPriceMicrocredits ?? 0,
                    outputTokenPriceMicrocredits: tier.outputTokenPriceMicrocredits ?? 0,
                    cachedTokenPriceMicrocredits: tier.cachedTokenPriceMicrocredits ?? 0,
                })),
            },
        ],
    });
    return normalizeConfigSnapshot({
        config: {
            ...defaultConfig,
            channels: [channel],
            model: `${channel.id}::${model}`,
            imageModel: capability === "image" ? `${channel.id}::${model}` : defaultConfig.imageModel,
            videoModel: capability === "video" ? `${channel.id}::${model}` : defaultConfig.videoModel,
            quality: "high",
            size: "16:9",
            vquality: "720P",
            videoSeconds: "5",
            count: "3",
        },
    }).config;
}

const textVideoRequirements: ModelRequirements = {
    capability: "video",
    input: { textCount: 1, imageCount: 0, videoCount: 0, audioCount: 0, characterCount: 0 },
    videoSeconds: "5",
    options: { size: "16:9", vquality: "720", videoSeconds: 5 },
};

describe("model request pricing", () => {
    test("preserves provider-specific resolution enums when matching price tiers", () => {
        expect(normalizeTierResolution("768P竖")).toBe("768p竖");
        expect(normalizeTierResolution("HD_Portrait")).toBe("hd_portrait");
    });

    test("matches the current Agnes resolution and duration tier and totals per-second credits", () => {
        const config = systemConfig({
            tiers: [
                { selector: { operation: "text_to_video", vquality: "720p", videoSeconds: "5" }, billingMode: "per_second", unitPriceMicrocredits: 25_000 },
                { selector: { operation: "text_to_video", vquality: "960p", videoSeconds: "5" }, billingMode: "per_second", unitPriceMicrocredits: 40_000 },
                { selector: { operation: "image_to_video", vquality: "720p", videoSeconds: "5", imageCount: "1" }, billingMode: "per_second", unitPriceMicrocredits: 30_000 },
            ],
        });
        const channel = resolveModelChannel(config, config.model);

        expect(
            requestCreditCost({
                channelMode: "remote",
                modelCosts: channel.modelCosts,
                model: "agnes-video-2.5",
                capability: "video",
                config,
                requirements: textVideoRequirements,
                seconds: "5",
            }),
        ).toBe(0.125);
    });

    test("uses reference count and operation to avoid a text-video price tier", () => {
        const config = systemConfig({
            tiers: [
                { selector: { operation: "text_to_video", vquality: "720p", videoSeconds: "5" }, billingMode: "per_second", unitPriceMicrocredits: 25_000 },
                { selector: { operation: "image_to_video", vquality: "720p", videoSeconds: "5", imageCount: "1" }, billingMode: "per_second", unitPriceMicrocredits: 30_000 },
            ],
        });
        const requirements: ModelRequirements = {
            ...textVideoRequirements,
            input: { ...textVideoRequirements.input!, imageCount: 1 },
        };
        const matched = priceTiersForCurrentSelection(resolveModelChannel(config, config.model).modelCosts![0]!.logicalPriceTiers!, "video", config, requirements);

        expect(matched).toHaveLength(1);
        expect(matched[0]?.unitPriceMicrocredits).toBe(30_000);
    });

    test("视频价格按实际输入素材归类，供应商执行操作仍保留", () => {
        const config = systemConfig({
            logicalModelId: "logical-video-operations",
            tiers: [
                { selector: { operation: "reference_to_video", vquality: "720p", videoSeconds: "5", imageCount: "2" }, billingMode: "per_second", unitPriceMicrocredits: 45_000 },
                { selector: { operation: "image_to_video", vquality: "720p", videoSeconds: "5", imageCount: "2" }, billingMode: "per_second", unitPriceMicrocredits: 30_000 },
            ],
        });
        const requirements: ModelRequirements = {
            ...textVideoRequirements,
            input: { ...textVideoRequirements.input!, imageCount: 2 },
            videoOperation: "image_to_video",
        };
        const tiers = resolveModelChannel(config, config.model).modelCosts![0]!.logicalPriceTiers!;

        expect(priceTiersForCurrentSelection(tiers, "video", config, requirements)[0]?.unitPriceMicrocredits).toBe(30_000);
        expect(priceTiersForCurrentSelection(tiers, "video", config, { ...requirements, videoOperationExplicit: true })[0]?.unitPriceMicrocredits).toBe(30_000);
        expect(modelQuoteRequest(config, config.model, "video", requirements)?.intent.operation).toBe("reference_to_video");
        expect(modelQuoteRequest(config, config.model, "video", { ...requirements, videoOperationExplicit: true })?.intent.operation).toBe("image_to_video");
    });

    test("multiplies fixed image request pricing by output count", () => {
        const config = systemConfig({
            capability: "image",
            tiers: [{ selector: { quality: "high", size: "16:9" }, billingMode: "fixed_request", unitPriceMicrocredits: 10_000 }],
        });
        const channel = resolveModelChannel(config, config.model);

        expect(
            requestCreditCost({
                channelMode: "remote",
                modelCosts: channel.modelCosts,
                model: "image-model",
                capability: "image",
                config,
                requirements: { capability: "image" },
                count: 3,
            }),
        ).toBe(0.03);
    });

    test("按当前分辨率与是否含视频精确选择 Token 单价，不伪造固定总价", () => {
        const prices = {
            "480p": { withoutVideo: 36.8, withVideo: 22.4 },
            "720p": { withoutVideo: 37.6, withVideo: 23.2 },
            "1080p": { withoutVideo: 40.8, withVideo: 24.8 },
        } as const;
        const tiers = Object.entries(prices).flatMap(([resolution, price]) => [
            {
                selector: { operation: "text_to_video", vquality: resolution },
                billingMode: "token" as const,
                unitPriceMicrocredits: 0,
                outputTokenPriceMicrocredits: price.withoutVideo * 1_000_000,
            },
            {
                selector: { operation: "video_to_video", vquality: resolution },
                billingMode: "token" as const,
                unitPriceMicrocredits: 0,
                outputTokenPriceMicrocredits: price.withVideo * 1_000_000,
            },
        ]);
        const config = systemConfig({ tiers });
        const channel = resolveModelChannel(config, config.model);

        for (const [resolution, price] of Object.entries(prices)) {
            for (const scenario of [
                { videoCount: 0, expected: price.withoutVideo },
                { videoCount: 1, expected: price.withVideo },
            ]) {
                const requirements: ModelRequirements = {
                    ...textVideoRequirements,
                    input: { ...textVideoRequirements.input!, videoCount: scenario.videoCount },
                    ...(scenario.videoCount ? { videoOperation: "reference_to_video", videoOperationExplicit: true } : {}),
                    options: { ...textVideoRequirements.options, vquality: resolution },
                };
                const options = {
                    channelMode: "remote" as const,
                    modelCosts: channel.modelCosts,
                    model: "agnes-video-2.5",
                    capability: "video" as const,
                    config,
                    requirements,
                    seconds: "5",
                };

                expect(requestCreditPricing(options)).toMatchObject({ billingMode: "token", perMillionCredits: scenario.expected });
                expect(requestCreditCost(options)).toBeNull();
            }
        }
    });

    test("builds a logical-model quote using the normalized current request", () => {
        const config = systemConfig({
            logicalModelId: "logical-video-1",
            tiers: [{ selector: {}, billingMode: "per_second", unitPriceMicrocredits: 25_000 }],
        });
        const quote = modelQuoteRequest(config, config.model, "video", textVideoRequirements);

        expect(quote).toMatchObject({
            logicalModelID: "logical-video-1",
            intent: {
                capability: "video",
                operation: "text_to_video",
                inputs: { image: 0, video: 0, audio: 0 },
                options: { vquality: "720", videoSeconds: 5 },
            },
        });
    });
});
