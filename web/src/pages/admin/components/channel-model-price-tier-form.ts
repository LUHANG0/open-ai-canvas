import type { ModelCapabilityChoice } from "@/components/model-protocol-picker";
import { videoResolutionComparisonKey } from "@/lib/video-generation-options";
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
const DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const VIDEO_TOKEN_STANDARD_RESOLUTIONS = new Set(["480p", "720p"]);

export function videoTokenPriceResolutions(values?: string[]) {
    const requested = values === undefined ? [...DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS] : values;
    const supported = new Set(requested.map((value) => videoResolutionComparisonKey(value)));
    return DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS.filter((value) => supported.has(value));
}

export function supportsVideoTokenPriceMatrixResolutions(values: string[]) {
    const normalized = Array.from(new Set(values.map((value) => videoResolutionComparisonKey(value)).filter(Boolean)));
    const supported = new Set(DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS);
    return normalized.length > 0 && normalized.every((value) => supported.has(value as (typeof DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS)[number]));
}

export function videoTokenPriceKeys(resolutions?: string[]): Array<keyof VideoTokenPriceMatrix> {
    const supported = videoTokenPriceResolutions(resolutions);
    return [
        ...(supported.some((value) => VIDEO_TOKEN_STANDARD_RESOLUTIONS.has(value)) ? (["withoutVideoStandard", "withVideoStandard"] as const) : []),
        ...(supported.includes("1080p") ? (["withoutVideo1080", "withVideo1080"] as const) : []),
    ];
}

export function videoTokenTierResolutions(tiers: PriceTierFormValues[]) {
    return videoTokenPriceResolutions(Array.from(new Set(tiers.map((tier) => tier.resolution))));
}

export function unsupportedVideoPriceTierResolutions(tiers: PriceTierFormValues[], supportedResolutions: string[]) {
    const supported = new Set(supportedResolutions.map((value) => videoResolutionComparisonKey(value)));
    return Array.from(
        new Set(
            tiers
                .filter((tier) => tier.matchMode === "advanced" && tier.resolution && tier.resolution !== "*")
                .map((tier) => videoResolutionComparisonKey(tier.resolution))
                .filter((resolution) => resolution && !supported.has(resolution)),
        ),
    );
}

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

export function videoTokenPriceTiersFromMatrix(matrix: VideoTokenPriceMatrix, providerModelKey = "", originalMatrix?: VideoTokenPriceMatrix, resolutions?: string[]): PriceTierFormValues[] {
    const tier = (resolution: string, operation: string, outputTokenPrice: number, originalOutputTokenPrice?: number): PriceTierFormValues => ({
        ...defaultPriceTier("advanced"),
        operation,
        resolution,
        providerModelKey,
        billingMode: "token",
        outputTokenPrice,
        originalOutputTokenPrice: originalOutputTokenPrice !== undefined && originalOutputTokenPrice > 0 ? originalOutputTokenPrice : undefined,
    });
    return ["*", "video_to_video"].flatMap((operation) =>
        videoTokenPriceResolutions(resolutions).map((resolution) => {
            const standard = VIDEO_TOKEN_STANDARD_RESOLUTIONS.has(resolution);
            const price = operation === "*" ? (standard ? matrix.withoutVideoStandard : matrix.withoutVideo1080) : standard ? matrix.withVideoStandard : matrix.withVideo1080;
            const originalPrice = operation === "*" ? (standard ? originalMatrix?.withoutVideoStandard : originalMatrix?.withoutVideo1080) : standard ? originalMatrix?.withVideoStandard : originalMatrix?.withVideo1080;
            return tier(resolution, operation, price, originalPrice);
        }),
    );
}

export function videoTokenPriceMatrixFromTiers(tiers: PriceTierFormValues[], resolutions?: string[]): VideoTokenPriceMatrix | undefined {
    return videoTokenPriceMatrixFromTiersBy(tiers, (tier) => Number(tier.outputTokenPrice || 0), resolutions);
}

export function videoTokenOriginalPriceMatrixFromTiers(tiers: PriceTierFormValues[], resolutions?: string[]): VideoTokenPriceMatrix | undefined {
    return videoTokenPriceMatrixFromTiersBy(tiers, (tier) => Number(tier.originalOutputTokenPrice || 0), resolutions);
}

function videoTokenPriceMatrixFromTiersBy(tiers: PriceTierFormValues[], price: (tier: PriceTierFormValues) => number, resolutions?: string[]): VideoTokenPriceMatrix | undefined {
    const supportedResolutions = videoTokenPriceResolutions(resolutions);
    if (!supportedResolutions.length || tiers.length !== supportedResolutions.length * 2) return undefined;
    const prices = new Map<string, number>();
    for (const tier of tiers) {
        if (tier.matchMode !== "advanced" || tier.billingMode !== "token" || tier.videoSeconds > 0 || tier.imageCount > 0) return undefined;
        const operation = tier.operation || "*";
        if (operation !== "*" && operation !== "video_to_video") return undefined;
        if (!supportedResolutions.includes(tier.resolution as (typeof DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS)[number])) return undefined;
        const key = `${operation}:${tier.resolution}`;
        if (prices.has(key)) return undefined;
        prices.set(key, price(tier));
    }
    if (["*", "video_to_video"].some((operation) => supportedResolutions.some((resolution) => !prices.has(`${operation}:${resolution}`)))) return undefined;
    const standardResolutions = supportedResolutions.filter((resolution) => VIDEO_TOKEN_STANDARD_RESOLUTIONS.has(resolution));
    const withoutStandard = standardResolutions.map((resolution) => prices.get(`*:${resolution}`)!);
    const withStandard = standardResolutions.map((resolution) => prices.get(`video_to_video:${resolution}`)!);
    if (new Set(withoutStandard).size > 1 || new Set(withStandard).size > 1) return undefined;
    return {
        withoutVideoStandard: withoutStandard[0] || 0,
        withoutVideo1080: prices.get("*:1080p") || 0,
        withVideoStandard: withStandard[0] || 0,
        withVideo1080: prices.get("video_to_video:1080p") || 0,
    };
}

export function expandSingleVideoTokenPriceTier(tiers: PriceTierFormValues[], resolutions?: string[]): PriceTierFormValues[] {
    if (tiers.length !== 1 || tiers[0].billingMode !== "token") return tiers;
    const price = Number(tiers[0].outputTokenPrice || 0);
    return videoTokenPriceTiersFromMatrix({ withoutVideoStandard: price, withoutVideo1080: price, withVideoStandard: price, withVideo1080: price }, tiers[0].providerModelKey, undefined, resolutions);
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
