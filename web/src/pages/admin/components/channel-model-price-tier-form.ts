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
    withoutVideo2K: number;
    withoutVideo4K: number;
    withVideoStandard: number;
    withVideo1080: number;
    withVideo2K: number;
    withVideo4K: number;
};

export type PriceDiscountSettings = {
    upstreamDiscount: number;
    discountIncrement: number;
};

const PRICE_PRECISION = 1_000_000;
const DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS = ["480p", "720p", "1080p", "1440p", "2160p"] as const;
const VIDEO_TOKEN_STANDARD_RESOLUTIONS = new Set(["480p", "720p"]);

type VideoTokenPriceMatrixKey = keyof VideoTokenPriceMatrix;

const VIDEO_TOKEN_PRICE_GROUPS: Array<{
    resolutions: ReadonlySet<string>;
    withoutVideo: VideoTokenPriceMatrixKey;
    withVideo: VideoTokenPriceMatrixKey;
}> = [
    { resolutions: VIDEO_TOKEN_STANDARD_RESOLUTIONS, withoutVideo: "withoutVideoStandard", withVideo: "withVideoStandard" },
    { resolutions: new Set(["1080p"]), withoutVideo: "withoutVideo1080", withVideo: "withVideo1080" },
    { resolutions: new Set(["1440p"]), withoutVideo: "withoutVideo2K", withVideo: "withVideo2K" },
    { resolutions: new Set(["2160p"]), withoutVideo: "withoutVideo4K", withVideo: "withVideo4K" },
];

export function emptyVideoTokenPriceMatrix(): VideoTokenPriceMatrix {
    return {
        withoutVideoStandard: 0,
        withoutVideo1080: 0,
        withoutVideo2K: 0,
        withoutVideo4K: 0,
        withVideoStandard: 0,
        withVideo1080: 0,
        withVideo2K: 0,
        withVideo4K: 0,
    };
}

export function videoTokenPriceResolutions(values?: string[]) {
    const requested = values === undefined ? [...DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS] : values;
    const supported = new Set(requested.map((value) => videoResolutionComparisonKey(value)));
    return DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS.filter((value) => supported.has(videoResolutionComparisonKey(value)));
}

export function supportsVideoTokenPriceMatrixResolutions(values: string[]) {
    const normalized = Array.from(new Set(values.map((value) => videoResolutionComparisonKey(value)).filter(Boolean)));
    const supported = new Set(DEFAULT_VIDEO_TOKEN_PRICE_RESOLUTIONS.map((value) => videoResolutionComparisonKey(value)));
    return normalized.length > 0 && normalized.every((value) => supported.has(value));
}

export function videoTokenPriceKeys(resolutions?: string[]): Array<keyof VideoTokenPriceMatrix> {
    const supported = videoTokenPriceResolutions(resolutions);
    return VIDEO_TOKEN_PRICE_GROUPS.flatMap((group) => (supported.some((value) => group.resolutions.has(value)) ? [group.withoutVideo, group.withVideo] : []));
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
            const keys = videoTokenPriceKeysForResolution(resolution);
            const price = matrix[operation === "*" ? keys.withoutVideo : keys.withVideo];
            const originalPrice = originalMatrix?.[operation === "*" ? keys.withoutVideo : keys.withVideo];
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
    const matrix = emptyVideoTokenPriceMatrix();
    for (const group of VIDEO_TOKEN_PRICE_GROUPS) {
        const groupResolutions = supportedResolutions.filter((resolution) => group.resolutions.has(resolution));
        if (!groupResolutions.length) continue;
        const withoutVideo = groupResolutions.map((resolution) => prices.get(`*:${resolution}`)!);
        const withVideo = groupResolutions.map((resolution) => prices.get(`video_to_video:${resolution}`)!);
        if (new Set(withoutVideo).size > 1 || new Set(withVideo).size > 1) return undefined;
        matrix[group.withoutVideo] = withoutVideo[0] || 0;
        matrix[group.withVideo] = withVideo[0] || 0;
    }
    return matrix;
}

export function expandSingleVideoTokenPriceTier(tiers: PriceTierFormValues[], resolutions?: string[]): PriceTierFormValues[] {
    if (tiers.length !== 1 || tiers[0].billingMode !== "token") return tiers;
    const price = Number(tiers[0].outputTokenPrice || 0);
    return videoTokenPriceTiersFromMatrix(
        {
            withoutVideoStandard: price,
            withoutVideo1080: price,
            withoutVideo2K: price,
            withoutVideo4K: price,
            withVideoStandard: price,
            withVideo1080: price,
            withVideo2K: price,
            withVideo4K: price,
        },
        tiers[0].providerModelKey,
        undefined,
        resolutions,
    );
}

function videoTokenPriceKeysForResolution(resolution: string) {
    const group = VIDEO_TOKEN_PRICE_GROUPS.find((item) => item.resolutions.has(resolution));
    if (!group) throw new Error(`Unsupported video Token price resolution: ${resolution}`);
    return group;
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
        originalUnitPrice: tier.originalUnitPriceMicrocredits > 0 ? tier.originalUnitPriceMicrocredits / 1_000_000 : undefined,
        originalInputTokenPrice: tier.originalInputTokenPriceMicrocredits > 0 ? tier.originalInputTokenPriceMicrocredits / 1_000_000 : undefined,
        originalOutputTokenPrice: tier.originalOutputTokenPriceMicrocredits > 0 ? tier.originalOutputTokenPriceMicrocredits / 1_000_000 : undefined,
        originalCachedTokenPrice: tier.originalCachedTokenPriceMicrocredits > 0 ? tier.originalCachedTokenPriceMicrocredits / 1_000_000 : undefined,
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
