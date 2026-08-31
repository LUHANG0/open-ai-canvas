import { describe, expect, test } from "bun:test";

import {
    defaultPriceTier,
    discountedPriceFromOriginal,
    emptyVideoTokenPriceMatrix,
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

const tokenMatrix = (values: Partial<ReturnType<typeof emptyVideoTokenPriceMatrix>>) => ({ ...emptyVideoTokenPriceMatrix(), ...values });

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

    test("expands the full video Token matrix into ten routable price tiers", () => {
        const matrix = tokenMatrix({
            withoutVideo480: 10.5,
            withoutVideo720: 11.5,
            withoutVideo1080: 12.75,
            withoutVideo2K: 14,
            withoutVideo4K: 16,
            withVideo480: 6,
            withVideo720: 7,
            withVideo1080: 7.75,
            withVideo2K: 9,
            withVideo4K: 11,
        });
        const tiers = videoTokenPriceTiersFromMatrix(matrix);

        expect(tiers).toHaveLength(10);
        expect(tiers.map((tier) => [tier.operation, tier.resolution, tier.outputTokenPrice])).toEqual([
            ["*", "480p", 10.5],
            ["*", "720p", 11.5],
            ["*", "1080p", 12.75],
            ["*", "1440p", 14],
            ["*", "2160p", 16],
            ["video_to_video", "480p", 6],
            ["video_to_video", "720p", 7],
            ["video_to_video", "1080p", 7.75],
            ["video_to_video", "1440p", 9],
            ["video_to_video", "2160p", 11],
        ]);
        expect(skuSelectorFromForm("video", tiers[0])).toEqual({ vquality: "480p" });
        expect(skuSelectorFromForm("video", tiers[5])).toEqual({ operation: "video_to_video", vquality: "480p" });
        expect(videoTokenPriceMatrixFromTiers(tiers)).toEqual(matrix);
    });

    test("only generates Token price tiers for resolutions enabled by the model capability", () => {
        const matrix = tokenMatrix({ withoutVideo720: 11.5, withoutVideo1080: 12.75, withVideo720: 7, withVideo1080: 7.75 });
        const resolutions = videoTokenPriceResolutions(["720P", "1080P"]);
        const tiers = videoTokenPriceTiersFromMatrix(matrix, "seedance", undefined, resolutions);

        expect(resolutions).toEqual(["720p", "1080p"]);
        expect(videoTokenPriceKeys(resolutions)).toEqual(["withoutVideo720", "withVideo720", "withoutVideo1080", "withVideo1080"]);
        expect(tiers.map((tier) => [tier.operation, tier.resolution])).toEqual([
            ["*", "720p"],
            ["*", "1080p"],
            ["video_to_video", "720p"],
            ["video_to_video", "1080p"],
        ]);
        expect(videoTokenPriceMatrixFromTiers(tiers, resolutions)).toEqual(matrix);
    });

    test("keeps a newly enabled 480P price empty instead of copying the existing 720P price", () => {
        const currentResolutions = videoTokenPriceResolutions(["720p", "1080p"]);
        const current = tokenMatrix({ withoutVideo720: 42, withoutVideo1080: 46.2, withVideo720: 25.2, withVideo1080: 27.6 });
        const existing = videoTokenPriceTiersFromMatrix(current, "artsdance", undefined, currentResolutions);
        const expandedResolutions = videoTokenPriceResolutions(["480p", "720p", "1080p"]);
        const expanded = videoTokenPriceTiersFromMatrix(videoTokenPriceMatrixFromTiers(existing, currentResolutions)!, "artsdance", undefined, expandedResolutions);

        expect(videoTokenPriceMatrixFromTiers(expanded, expandedResolutions)).toEqual(current);
        expect(expanded.filter((tier) => tier.resolution === "480p").map((tier) => tier.outputTokenPrice)).toEqual([0, 0]);
        expect(expanded.filter((tier) => tier.resolution === "720p").map((tier) => tier.outputTokenPrice)).toEqual([42, 25.2]);
    });

    test("supports a two-tier 1080P-only Token matrix", () => {
        const matrix = tokenMatrix({ withoutVideo1080: 51, withVideo1080: 31 });
        const resolutions = videoTokenPriceResolutions(["1080"]);
        const tiers = videoTokenPriceTiersFromMatrix(matrix, "seedance", undefined, resolutions);

        expect(tiers).toHaveLength(2);
        expect(videoTokenPriceKeys(resolutions)).toEqual(["withoutVideo1080", "withVideo1080"]);
        expect(videoTokenPriceMatrixFromTiers(tiers, resolutions)).toEqual(matrix);
    });

    test("normalizes 2K and 4K aliases into high-resolution Token price tiers", () => {
        const matrix = tokenMatrix({ withoutVideo2K: 61, withoutVideo4K: 81, withVideo2K: 41, withVideo4K: 51 });
        const resolutions = videoTokenPriceResolutions(["2K", "2160P"]);
        const tiers = videoTokenPriceTiersFromMatrix(matrix, "high-resolution-video", undefined, resolutions);

        expect(resolutions).toEqual(["1440p", "2160p"]);
        expect(videoTokenPriceKeys(resolutions)).toEqual(["withoutVideo2K", "withVideo2K", "withoutVideo4K", "withVideo4K"]);
        expect(tiers.map((tier) => [tier.operation, tier.resolution, tier.outputTokenPrice])).toEqual([
            ["*", "1440p", 61],
            ["*", "2160p", 81],
            ["video_to_video", "1440p", 41],
            ["video_to_video", "2160p", 51],
        ]);
        expect(videoTokenPriceMatrixFromTiers(tiers, resolutions)).toEqual(matrix);
    });

    test("removes stale 480P tiers after capability shrink while preserving prices and original drafts", () => {
        const matrix = tokenMatrix({ withoutVideo480: 35.2, withoutVideo720: 36.8, withoutVideo1080: 40.8, withVideo480: 21.6, withVideo720: 22.4, withVideo1080: 24.8 });
        const original = tokenMatrix({ withoutVideo480: 44, withoutVideo720: 46, withoutVideo1080: 51, withVideo480: 27, withVideo720: 28, withVideo1080: 31 });
        const existing = videoTokenPriceTiersFromMatrix(matrix, "seedance", original);
        const currentResolutions = videoTokenTierResolutions(existing);
        const nextResolutions = videoTokenPriceResolutions(["720p", "1080p"]);
        const next = videoTokenPriceTiersFromMatrix(videoTokenPriceMatrixFromTiers(existing, currentResolutions)!, "seedance", videoTokenOriginalPriceMatrixFromTiers(existing, currentResolutions), nextResolutions);

        expect(next).toHaveLength(4);
        expect(next.some((tier) => tier.resolution === "480p")).toBe(false);
        expect(videoTokenPriceMatrixFromTiers(next, nextResolutions)).toEqual(
            tokenMatrix({ withoutVideo720: matrix.withoutVideo720, withoutVideo1080: matrix.withoutVideo1080, withVideo720: matrix.withVideo720, withVideo1080: matrix.withVideo1080 }),
        );
        expect(videoTokenOriginalPriceMatrixFromTiers(next, nextResolutions)).toEqual(
            tokenMatrix({ withoutVideo720: original.withoutVideo720, withoutVideo1080: original.withoutVideo1080, withVideo720: original.withVideo720, withVideo1080: original.withVideo1080 }),
        );
    });

    test("reports stale manual price-tier resolutions with normalized aliases", () => {
        const tiers = [{ ...defaultPriceTier("advanced"), resolution: "480P" }];

        expect(unsupportedVideoPriceTierResolutions(tiers, ["720p", "1080p"])).toEqual(["480p"]);
        expect(unsupportedVideoPriceTierResolutions(tiers, ["480"])).toEqual([]);
        expect(supportsVideoTokenPriceMatrixResolutions(["480P", "720", "1080p"])).toBe(true);
        expect(supportsVideoTokenPriceMatrixResolutions(["720p", "2K", "4K"])).toBe(true);
        expect(supportsVideoTokenPriceMatrixResolutions(["720p", "8K"])).toBe(false);
    });

    test("upgrades a single video Token price into an editable matrix without changing its price", () => {
        const tier = { ...defaultPriceTier(), billingMode: "token" as const, outputTokenPrice: 9.5 };
        const expanded = expandSingleVideoTokenPriceTier([tier]);

        expect(expanded).toHaveLength(10);
        expect(videoTokenPriceMatrixFromTiers(expanded)).toEqual(
            tokenMatrix({ withoutVideo480: 9.5, withoutVideo720: 9.5, withoutVideo1080: 9.5, withoutVideo2K: 9.5, withoutVideo4K: 9.5, withVideo480: 9.5, withVideo720: 9.5, withVideo1080: 9.5, withVideo2K: 9.5, withVideo4K: 9.5 }),
        );
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
        const original = tokenMatrix({ withoutVideo480: 44, withoutVideo720: 46, withoutVideo1080: 51, withVideo480: 27, withVideo720: 28, withVideo1080: 31 });
        const resolutions = videoTokenPriceResolutions(["480p", "720p", "1080p"]);
        const tiers = videoTokenPriceTiersFromMatrix(original, "", undefined, resolutions);
        const converted = priceTiersWithDiscountedPrices(
            tiers.map((tier) => ({ ...tier, originalOutputTokenPrice: tier.outputTokenPrice })),
            { upstreamDiscount: 8, discountIncrement: 0.5 },
        );

        expect(videoTokenPriceMatrixFromTiers(converted, resolutions)).toEqual(tokenMatrix({ withoutVideo480: 37.4, withoutVideo720: 39.1, withoutVideo1080: 43.35, withVideo480: 22.95, withVideo720: 23.8, withVideo1080: 26.35 }));
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

    test("keeps original prices alongside the converted matrix", () => {
        const original = tokenMatrix({ withoutVideo480: 40, withoutVideo720: 42, withoutVideo1080: 46, withVideo480: 68, withVideo720: 70, withVideo1080: 77 });
        const converted = tokenMatrix({ withoutVideo480: 32, withoutVideo720: 33.6, withoutVideo1080: 36.8, withVideo480: 54.4, withVideo720: 56, withVideo1080: 61.6 });
        const resolutions = videoTokenPriceResolutions(["480p", "720p", "1080p"]);
        const tiers = videoTokenPriceTiersFromMatrix(converted, "artsdance-2-5-pro-260801", original, resolutions);

        expect(videoTokenPriceMatrixFromTiers(tiers, resolutions)).toEqual(converted);
        expect(videoTokenOriginalPriceMatrixFromTiers(tiers, resolutions)).toEqual(original);
    });

    test("does not overwrite untouched matrix prices while original prices are entered cell by cell", () => {
        const current = tokenMatrix({ withoutVideo480: 10.5, withoutVideo720: 11.5, withoutVideo1080: 12.75, withVideo480: 6, withVideo720: 7, withVideo1080: 7.75 });
        const sparseOriginal = tokenMatrix({ withoutVideo1080: 46 });
        const resolutions = videoTokenPriceResolutions(["480p", "720p", "1080p"]);
        const tiers = videoTokenPriceTiersFromMatrix({ ...current, withoutVideo1080: 36.8 }, "artsdance", sparseOriginal, resolutions);
        const converted = priceTiersWithDiscountedPrices(tiers, { upstreamDiscount: 7.5, discountIncrement: 0.5 });

        expect(videoTokenPriceMatrixFromTiers(converted, resolutions)).toEqual({ ...current, withoutVideo1080: 36.8 });
        expect(converted.filter((tier) => tier.originalOutputTokenPrice !== undefined)).toHaveLength(1);
    });
});
