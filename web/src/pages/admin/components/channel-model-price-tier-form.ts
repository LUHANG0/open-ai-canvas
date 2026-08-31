import type { ModelCapabilityChoice } from "@/components/model-protocol-picker";
import type { ChannelModel, ChannelModelPriceTier } from "@/services/api/wallet";

export type PriceTierMatchMode = "default" | "advanced";

export type PriceTierFormValues = {
    matchMode: PriceTierMatchMode;
    operation: string;
    quality: string;
    size: string;
    resolution: string;
    videoSeconds: number;
    imageCount: number;
    providerModelKey?: string;
    billingMode: ChannelModel["billingMode"];
    unitPrice: number;
    inputTokenPrice: number;
    outputTokenPrice: number;
    cachedTokenPrice: number;
    originalUnitPrice?: number;
    originalInputTokenPrice?: number;
    originalOutputTokenPrice?: number;
    originalCachedTokenPrice?: number;
    priceConfigured: boolean;
    enabled: boolean;
};

export type VideoTokenPriceMatrix = {
    withoutVideoStandard: number;
    withoutVideo1080: number;
    withVideoStandard: number;
    withVideo1080: number;
};

export type PriceDiscountSettings = {
    upstreamDiscount: number;
    discountIncrement: number;
};

const PRICE_PRECISION = 1_000_000;

export function sellingDiscount(settings: PriceDiscountSettings) {
    const upstream = Number(settings.upstreamDiscount);
    const increment = Number(settings.discountIncrement);
    const result = upstream + increment;
    return Number.isFinite(upstream) && Number.isFinite(increment) && upstream > 0 && increment >= 0 && result <= 10 ? result : undefined;
}

export function discountedPriceFromOriginal(originalPrice: number | undefined, settings: PriceDiscountSettings) {
    const original = Number(originalPrice);
    const discount = sellingDiscount(settings);
    if (!Number.isFinite(original) || original < 0 || discount === undefined) return 0;
    return Math.round((original * discount * PRICE_PRECISION) / 10) / PRICE_PRECISION;
}

export function upstreamCostFromOriginal(originalPrice: number | undefined, upstreamDiscount: number) {
    return discountedPriceFromOriginal(originalPrice, { upstreamDiscount, discountIncrement: 0 });
}

export function priceTiersWithDiscountedPrices(tiers: PriceTierFormValues[], settings: PriceDiscountSettings) {
    return tiers.map((tier) => ({
        ...tier,
        unitPrice: tier.originalUnitPrice === undefined ? tier.unitPrice : discountedPriceFromOriginal(tier.originalUnitPrice, settings),
        inputTokenPrice: tier.originalInputTokenPrice === undefined ? tier.inputTokenPrice : discountedPriceFromOriginal(tier.originalInputTokenPrice, settings),
        outputTokenPrice: tier.originalOutputTokenPrice === undefined ? tier.outputTokenPrice : discountedPriceFromOriginal(tier.originalOutputTokenPrice, settings),
        cachedTokenPrice: tier.originalCachedTokenPrice === undefined ? tier.cachedTokenPrice : discountedPriceFromOriginal(tier.originalCachedTokenPrice, settings),
    }));
}

export function defaultPriceTier(matchMode: PriceTierMatchMode = "default"): PriceTierFormValues {
    return {
        matchMode,
        operation: "*",
        quality: "*",
        size: "*",
        resolution: "*",
        videoSeconds: 0,
        imageCount: 0,
        providerModelKey: "",
        billingMode: "fixed_request",
        unitPrice: 0,
        inputTokenPrice: 0,
        outputTokenPrice: 0,
        cachedTokenPrice: 0,
        priceConfigured: true,
        enabled: true,
    };
}

export function videoTokenPriceTiersFromMatrix(matrix: VideoTokenPriceMatrix, providerModelKey = "", originalMatrix?: VideoTokenPriceMatrix): PriceTierFormValues[] {
    const tier = (resolution: string, operation: string, outputTokenPrice: number, originalOutputTokenPrice?: number): PriceTierFormValues => ({
        ...defaultPriceTier("advanced"),
        operation,
        resolution,
        providerModelKey,
        billingMode: "token",
        outputTokenPrice,
        originalOutputTokenPrice: originalOutputTokenPrice !== undefined && originalOutputTokenPrice > 0 ? originalOutputTokenPrice : undefined,
    });
    return [
        tier("480p", "*", matrix.withoutVideoStandard, originalMatrix?.withoutVideoStandard),
        tier("720p", "*", matrix.withoutVideoStandard, originalMatrix?.withoutVideoStandard),
        tier("1080p", "*", matrix.withoutVideo1080, originalMatrix?.withoutVideo1080),
        tier("480p", "video_to_video", matrix.withVideoStandard, originalMatrix?.withVideoStandard),
        tier("720p", "video_to_video", matrix.withVideoStandard, originalMatrix?.withVideoStandard),
        tier("1080p", "video_to_video", matrix.withVideo1080, originalMatrix?.withVideo1080),
    ];
}

export function videoTokenPriceMatrixFromTiers(tiers: PriceTierFormValues[]): VideoTokenPriceMatrix | undefined {
    return videoTokenPriceMatrixFromTiersBy(tiers, (tier) => Number(tier.outputTokenPrice || 0));
}

export function videoTokenOriginalPriceMatrixFromTiers(tiers: PriceTierFormValues[]): VideoTokenPriceMatrix | undefined {
    return videoTokenPriceMatrixFromTiersBy(tiers, (tier) => Number(tier.originalOutputTokenPrice || 0));
}

function videoTokenPriceMatrixFromTiersBy(tiers: PriceTierFormValues[], price: (tier: PriceTierFormValues) => number): VideoTokenPriceMatrix | undefined {
    if (tiers.length !== 6) return undefined;
    const prices = new Map<string, number>();
    for (const tier of tiers) {
        if (tier.matchMode !== "advanced" || tier.billingMode !== "token" || tier.videoSeconds > 0 || tier.imageCount > 0) return undefined;
        const operation = tier.operation || "*";
        if (operation !== "*" && operation !== "video_to_video") return undefined;
        if (!["480p", "720p", "1080p"].includes(tier.resolution)) return undefined;
        const key = `${operation}:${tier.resolution}`;
        if (prices.has(key)) return undefined;
        prices.set(key, price(tier));
    }
    const without480 = prices.get("*:480p");
    const without720 = prices.get("*:720p");
    const without1080 = prices.get("*:1080p");
    const with480 = prices.get("video_to_video:480p");
    const with720 = prices.get("video_to_video:720p");
    const with1080 = prices.get("video_to_video:1080p");
    if (without480 === undefined || without720 === undefined || without1080 === undefined || with480 === undefined || with720 === undefined || with1080 === undefined || without480 !== without720 || with480 !== with720) return undefined;
    return {
        withoutVideoStandard: without480,
        withoutVideo1080: without1080,
        withVideoStandard: with480,
        withVideo1080: with1080,
    };
}

export function expandSingleVideoTokenPriceTier(tiers: PriceTierFormValues[]): PriceTierFormValues[] {
    if (tiers.length !== 1 || tiers[0].billingMode !== "token") return tiers;
    const price = Number(tiers[0].outputTokenPrice || 0);
    return videoTokenPriceTiersFromMatrix({ withoutVideoStandard: price, withoutVideo1080: price, withVideoStandard: price, withVideo1080: price }, tiers[0].providerModelKey);
}

export function priceTierToForm(tier: ChannelModelPriceTier): PriceTierFormValues {
    const selector = tier.selector || {};
    const hasSpecificMatch = Object.values(selector).some((value) => value && value !== "*") || (tier.resolution && tier.resolution !== "*") || tier.videoSeconds > 0;
    return {
        matchMode: hasSpecificMatch ? "advanced" : "default",
        operation: selector.operation || "*",
        quality: selector.quality || "*",
        size: selector.size || "*",
        resolution: tier.resolution || "*",
        videoSeconds: tier.videoSeconds || 0,
        imageCount: Number(selector.imageCount || 0),
        providerModelKey: tier.providerModelKey || "",
        billingMode: tier.billingMode,
        unitPrice: tier.unitPriceMicrocredits / 1_000_000,
        inputTokenPrice: tier.inputTokenPriceMicrocredits / 1_000_000,
        outputTokenPrice: tier.outputTokenPriceMicrocredits / 1_000_000,
        cachedTokenPrice: tier.cachedTokenPriceMicrocredits / 1_000_000,
        priceConfigured: tier.priceConfigured,
        enabled: tier.enabled,
    };
}

export function legacyPriceTierToForm(item: ChannelModel): PriceTierFormValues {
    return {
        ...defaultPriceTier(),
        providerModelKey: item.providerModelKey || "",
        billingMode: item.billingMode,
        unitPrice: item.unitPriceMicrocredits / 1_000_000,
        inputTokenPrice: item.inputTokenPriceMicrocredits / 1_000_000,
        outputTokenPrice: item.outputTokenPriceMicrocredits / 1_000_000,
        cachedTokenPrice: item.cachedTokenPriceMicrocredits / 1_000_000,
        priceConfigured: item.priceConfigured,
        enabled: item.enabled,
    };
}

export function skuSelectorFromForm(capability: ModelCapabilityChoice, tier: PriceTierFormValues) {
    if (tier.matchMode !== "advanced") return {};
    const selector: Record<string, string> = {};
    if (tier.operation && tier.operation !== "*") selector.operation = tier.operation;
    if (capability === "video") {
        if (tier.resolution && tier.resolution !== "*") selector.vquality = tier.resolution;
        if (Number(tier.videoSeconds) > 0) selector.videoSeconds = String(Number(tier.videoSeconds));
        if (Number(tier.imageCount) > 0) selector.imageCount = String(Number(tier.imageCount));
    }
    if (capability === "image") {
        if (tier.quality && tier.quality !== "*") selector.quality = tier.quality;
        if (tier.size && tier.size !== "*") selector.size = tier.size;
    }
    return selector;
}

export function priceTierResolutionFromForm(capability: ModelCapabilityChoice, tier: PriceTierFormValues) {
    return capability === "video" && tier.matchMode === "advanced" ? tier.resolution || "*" : "*";
}

export function priceTierVideoSecondsFromForm(capability: ModelCapabilityChoice, tier: PriceTierFormValues) {
    return capability === "video" && tier.matchMode === "advanced" ? Number(tier.videoSeconds || 0) : 0;
}
