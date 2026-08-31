import { describe, expect, test } from "bun:test";

import {
    defaultPriceTier,
    discountedPriceFromOriginal,
    expandSingleVideoTokenPriceTier,
    priceTiersWithDiscountedPrices,
    priceTierResolutionFromForm,
    priceTierToForm,
    priceTierVideoSecondsFromForm,
    sellingDiscount,
    skuSelectorFromForm,
    supportsVideoTokenPriceMatrixResolutions,
    unsupportedVideoPriceTierResolutions,
    upstreamCostFromOriginal,
    videoTokenOriginalPriceMatrixFromTiers,
    videoTokenPriceKeys,
    videoTokenPriceMatrixFromTiers,
    videoTokenPriceResolutions,
    videoTokenPriceTiersFromMatrix,
    videoTokenTierResolutions,
} from "../src/pages/admin/components/channel-model-price-tier-form";
import type { ChannelModelPriceTier } from "../src/services/api/wallet";

describe("channel model price tier defaults", () => {
    test("creates a usable all-spec fallback price by default", () => {
        const tier = defaultPriceTier();

        expect(tier.matchMode).toBe("default");
        expect(tier.priceConfigured).toBe(true);
        expect(tier.enabled).toBe(true);
        expect(skuSelectorFromForm("image", { ...tier, quality: "2k", size: "1:1" })).toEqual({});
    });

    test("keeps explicit image specification pricing when advanced mode is selected", () => {
        const tier = defaultPriceTier("advanced");

        expect(skuSelectorFromForm("image", { ...tier, quality: "2k", size: "1:1" })).toEqual({ quality: "2k", size: "1:1" });
    });

    test("drops stale video selectors after switching back to the default price", () => {
        const tier = { ...defaultPriceTier("advanced"), resolution: "1080p", videoSeconds: 10, imageCount: 2 };
        const defaultTier = { ...tier, matchMode: "default" as const };

        expect(skuSelectorFromForm("video", defaultTier)).toEqual({});
        expect(priceTierResolutionFromForm("video", defaultTier)).toBe("*");
        expect(priceTierVideoSecondsFromForm("video", defaultTier)).toBe(0);
    });

    test("restores existing specific tiers in advanced mode and wildcard tiers as defaults", () => {
        const base: ChannelModelPriceTier = {
            id: "tier-1",
            channelModelId: "model-1",
            selector: {},
            selectorKey: "{}",
            resolution: "*",
            videoSeconds: 0,
            providerModelKey: "gpt-image-2",
            billingMode: "fixed_request" as const,
            unitPriceMicrocredits: 4_000_000,
            inputTokenPriceMicrocredits: 0,
            outputTokenPriceMicrocredits: 0,
            cachedTokenPriceMicrocredits: 0,
            priceConfigured: true,
            enabled: true,
            priceVersion: 1,
            createdAt: "2026-08-29T00:00:00Z",
            updatedAt: "2026-08-29T00:00:00Z",
        };

        expect(priceTierToForm(base).matchMode).toBe("default");
        expect(priceTierToForm({ ...base, selector: { quality: "2k" } }).matchMode).toBe("advanced");
    });

    test("expands the four-cell video Token matrix into six routable price tiers", () => {
        const tiers = videoTokenPriceTiersFromMatrix({ withoutVideoStandard: 11.5, withoutVideo1080: 12.75, withVideoStandard: 7, withVideo1080: 7.75 });

        expect(tiers).toHaveLength(6);
        expect(tiers.map((tier) => [tier.operation, tier.resolution, tier.outputTokenPrice])).toEqual([
            ["*", "480p", 11.5],
            ["*", "720p", 11.5],
            ["*", "1080p", 12.75],
            ["video_to_video", "480p", 7],
            ["video_to_video", "720p", 7],
            ["video_to_video", "1080p", 7.75],
        ]);
        expect(skuSelectorFromForm("video", tiers[0])).toEqual({ vquality: "480p" });
        expect(skuSelectorFromForm("video", tiers[3])).toEqual({ operation: "video_to_video", vquality: "480p" });
        expect(videoTokenPriceMatrixFromTiers(tiers)).toEqual({ withoutVideoStandard: 11.5, withoutVideo1080: 12.75, withVideoStandard: 7, withVideo1080: 7.75 });
    });

    test("only generates Token price tiers for resolutions enabled by the model capability", () => {
        const matrix = { withoutVideoStandard: 11.5, withoutVideo1080: 12.75, withVideoStandard: 7, withVideo1080: 7.75 };
        const resolutions = videoTokenPriceResolutions(["720P", "1080P"]);
        const tiers = videoTokenPriceTiersFromMatrix(matrix, "seedance", undefined, resolutions);

        expect(resolutions).toEqual(["720p", "1080p"]);
        expect(videoTokenPriceKeys(resolutions)).toEqual(["withoutVideoStandard", "withVideoStandard", "withoutVideo1080", "withVideo1080"]);
        expect(tiers.map((tier) => [tier.operation, tier.resolution])).toEqual([
            ["*", "720p"],
            ["*", "1080p"],
            ["video_to_video", "720p"],
            ["video_to_video", "1080p"],
        ]);
        expect(videoTokenPriceMatrixFromTiers(tiers, resolutions)).toEqual(matrix);
    });

    test("supports a two-tier 1080P-only Token matrix", () => {
        const matrix = { withoutVideoStandard: 0, withoutVideo1080: 51, withVideoStandard: 0, withVideo1080: 31 };
        const resolutions = videoTokenPriceResolutions(["1080"]);
        const tiers = videoTokenPriceTiersFromMatrix(matrix, "seedance", undefined, resolutions);

        expect(tiers).toHaveLength(2);
        expect(videoTokenPriceKeys(resolutions)).toEqual(["withoutVideo1080", "withVideo1080"]);
        expect(videoTokenPriceMatrixFromTiers(tiers, resolutions)).toEqual(matrix);
    });

    test("removes stale 480P tiers after capability shrink while preserving prices and original drafts", () => {
        const matrix = { withoutVideoStandard: 36.8, withoutVideo1080: 40.8, withVideoStandard: 22.4, withVideo1080: 24.8 };
        const original = { withoutVideoStandard: 46, withoutVideo1080: 51, withVideoStandard: 28, withVideo1080: 31 };
        const existing = videoTokenPriceTiersFromMatrix(matrix, "seedance", original);
        const currentResolutions = videoTokenTierResolutions(existing);
        const nextResolutions = videoTokenPriceResolutions(["720p", "1080p"]);
        const next = videoTokenPriceTiersFromMatrix(videoTokenPriceMatrixFromTiers(existing, currentResolutions)!, "seedance", videoTokenOriginalPriceMatrixFromTiers(existing, currentResolutions), nextResolutions);

        expect(next).toHaveLength(4);
        expect(next.some((tier) => tier.resolution === "480p")).toBe(false);
        expect(videoTokenPriceMatrixFromTiers(next, nextResolutions)).toEqual(matrix);
        expect(videoTokenOriginalPriceMatrixFromTiers(next, nextResolutions)).toEqual(original);
    });

    test("reports stale manual price-tier resolutions with normalized aliases", () => {
        const tiers = [{ ...defaultPriceTier("advanced"), resolution: "480P" }];

        expect(unsupportedVideoPriceTierResolutions(tiers, ["720p", "1080p"])).toEqual(["480p"]);
        expect(unsupportedVideoPriceTierResolutions(tiers, ["480"])).toEqual([]);
        expect(supportsVideoTokenPriceMatrixResolutions(["480P", "720", "1080p"])).toBe(true);
        expect(supportsVideoTokenPriceMatrixResolutions(["720p", "2K"])).toBe(false);
    });

    test("upgrades a single video Token price into an editable matrix without changing its price", () => {
        const tier = { ...defaultPriceTier(), billingMode: "token" as const, outputTokenPrice: 9.5 };
        const expanded = expandSingleVideoTokenPriceTier([tier]);

        expect(expanded).toHaveLength(6);
        expect(videoTokenPriceMatrixFromTiers(expanded)).toEqual({ withoutVideoStandard: 9.5, withoutVideo1080: 9.5, withVideoStandard: 9.5, withVideo1080: 9.5 });
    });

    test("converts original RMB prices with the upstream discount plus the configured increment", () => {
        const settings = { upstreamDiscount: 7.5, discountIncrement: 0.5 };

        expect(sellingDiscount(settings)).toBe(8);
        expect(upstreamCostFromOriginal(46, settings.upstreamDiscount)).toBe(34.5);
        expect(discountedPriceFromOriginal(46, settings)).toBe(36.8);
        expect(discountedPriceFromOriginal(77, settings)).toBe(61.6);
        expect(sellingDiscount({ upstreamDiscount: 9.8, discountIncrement: 0.5 })).toBeUndefined();
    });

    test("converts the official Seedance matrix at upstream 8 discount and selling 8.5 discount", () => {
        const original = { withoutVideoStandard: 46, withoutVideo1080: 51, withVideoStandard: 28, withVideo1080: 31 };
        const tiers = videoTokenPriceTiersFromMatrix(original);
        const converted = priceTiersWithDiscountedPrices(
            tiers.map((tier) => ({ ...tier, originalOutputTokenPrice: tier.outputTokenPrice })),
            { upstreamDiscount: 8, discountIncrement: 0.5 },
        );

        expect(videoTokenPriceMatrixFromTiers(converted)).toEqual({
            withoutVideoStandard: 39.1,
            withoutVideo1080: 43.35,
            withVideoStandard: 23.8,
            withVideo1080: 26.35,
        });
    });

    test("updates only price fields that have an original-price draft", () => {
        const tier = {
            ...defaultPriceTier(),
            billingMode: "token" as const,
            inputTokenPrice: 1.25,
            outputTokenPrice: 2.5,
            cachedTokenPrice: 0.75,
            originalInputTokenPrice: 10,
            originalOutputTokenPrice: 46,
        };
        const [converted] = priceTiersWithDiscountedPrices([tier], { upstreamDiscount: 7.5, discountIncrement: 0.5 });

        expect(converted.inputTokenPrice).toBe(8);
        expect(converted.outputTokenPrice).toBe(36.8);
        expect(converted.cachedTokenPrice).toBe(0.75);
    });

    test("keeps original prices alongside the converted six-tier matrix", () => {
        const original = { withoutVideoStandard: 42, withoutVideo1080: 46, withVideoStandard: 70, withVideo1080: 77 };
        const converted = { withoutVideoStandard: 33.6, withoutVideo1080: 36.8, withVideoStandard: 56, withVideo1080: 61.6 };
        const tiers = videoTokenPriceTiersFromMatrix(converted, "artsdance-2-5-pro-260801", original);

        expect(videoTokenPriceMatrixFromTiers(tiers)).toEqual(converted);
        expect(videoTokenOriginalPriceMatrixFromTiers(tiers)).toEqual(original);
    });

    test("does not overwrite untouched matrix prices while original prices are entered cell by cell", () => {
        const current = { withoutVideoStandard: 11.5, withoutVideo1080: 12.75, withVideoStandard: 7, withVideo1080: 7.75 };
        const sparseOriginal = { withoutVideoStandard: 0, withoutVideo1080: 46, withVideoStandard: 0, withVideo1080: 0 };
        const tiers = videoTokenPriceTiersFromMatrix({ ...current, withoutVideo1080: 36.8 }, "artsdance", sparseOriginal);
        const converted = priceTiersWithDiscountedPrices(tiers, { upstreamDiscount: 7.5, discountIncrement: 0.5 });

        expect(videoTokenPriceMatrixFromTiers(converted)).toEqual({ ...current, withoutVideo1080: 36.8 });
        expect(converted.filter((tier) => tier.originalOutputTokenPrice !== undefined)).toHaveLength(1);
    });
});
