import { modelRequestOptions, resolveVideoOperation, type ModelRequirements } from "@/lib/model-selection";
import { videoResolutionComparisonKey } from "@/lib/video-generation-options";
import type { ModelRequestIntent } from "@/services/api/logical-models";
import { modelOptionName, resolveModelChannel, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

export type ModelPriceTier = NonNullable<NonNullable<AiConfig["channels"][number]["modelCosts"]>[number]["logicalPriceTiers"]>[number];

type ModelCreditCost = {
    model: string;
    pricePolicy?: "channel" | "unified";
    billingMode: "fixed_request" | "per_second" | "token";
    unitPriceMicrocredits: number;
    inputTokenPriceMicrocredits?: number;
    outputTokenPriceMicrocredits?: number;
    cachedTokenPriceMicrocredits?: number;
    logicalPriceTiers?: ModelPriceTier[];
};

export type RequestCreditPricing =
    | { billingMode: "fixed_request" | "per_second"; estimatedCredits: number }
    | {
          billingMode: "token";
          perMillionCredits: number;
          inputPerMillionCredits: number;
          outputPerMillionCredits: number;
          cachedPerMillionCredits: number;
      };

type RequestCreditPricingOptions = {
    channelMode: string;
    modelCosts?: ModelCreditCost[];
    model: string;
    count?: string | number;
    seconds?: string | number;
    capability?: ModelCapability;
    config?: AiConfig;
    requirements?: ModelRequirements;
};

export function requestCreditPricing(options: RequestCreditPricingOptions): RequestCreditPricing | null {
    if (options.channelMode !== "remote") return null;
    const cost = options.modelCosts?.find((item) => item.model === options.model) || null;
    if (!cost) return null;
    if (cost.pricePolicy === "channel") {
        if (!options.config) return null;
        const tiers = priceTiersForCurrentSelection(cost.logicalPriceTiers || [], options.capability, options.config, options.requirements);
        if (!tiers.length) return null;
        const first = creditPricingForEntry(tiers[0], options);
        if (!first) return null;
        // 同一精确规格可能来自多个逻辑路由；只有价格一致时才可在客户端安全展示。
        if (tiers.slice(1).some((tier) => !sameCreditPricing(first, creditPricingForEntry(tier, options)))) return null;
        return first;
    }
    return creditPricingForEntry(cost, options);
}

export function requestCreditCost(options: RequestCreditPricingOptions) {
    const pricing = requestCreditPricing(options);
    // Token 订单由服务端按请求体预授权并在 usage 返回后结算，前端不伪造固定总价。
    return pricing?.billingMode === "token" ? null : (pricing?.estimatedCredits ?? null);
}

export function priceTiersForCurrentSelection(tiers: ModelPriceTier[], capability: ModelCapability | undefined, config: AiConfig, requirements?: ModelRequirements) {
    const requested = priceSelectorForRequest(capability, config, requirements);
    let bestScore = -1;
    let matched: ModelPriceTier[] = [];
    for (const tier of tiers) {
        const selector = priceSelectorForTier(tier);
        const conditions = Object.entries(selector).filter(([, value]) => value && value !== "*");
        if (conditions.some(([key, value]) => requested[key] !== value)) continue;
        const score = conditions.length;
        if (score > bestScore) {
            bestScore = score;
            matched = [tier];
        } else if (score === bestScore) {
            matched.push(tier);
        }
    }
    return matched;
}

export function modelQuoteRequest(config: AiConfig, value: string, capability?: ModelCapability, requirements?: ModelRequirements): { logicalModelID: string; intent: ModelRequestIntent } | undefined {
    if (!capability || !value) return undefined;
    const channel = resolveModelChannel(config, value);
    if (channel.scope !== "system") return undefined;
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(value));
    if (!cost?.logicalModelId) return undefined;
    const input = requirements?.input;
    const intent: ModelRequestIntent = {
        capability,
        operation: capability === "video" && input ? resolveVideoOperation(input, requirements?.videoOperation, requirements?.videoOperationExplicit) : requirements?.videoOperation,
        inputs: {
            image: (input?.imageCount || 0) + (input?.characterCount || 0),
            video: input?.videoCount || 0,
            audio: input?.audioCount || 0,
        },
        options: {
            ...modelRequestOptions(config, capability),
            ...(requirements?.options || {}),
            ...(requirements?.videoSeconds ? { videoSeconds: Number(requirements.videoSeconds) } : {}),
            ...(requirements?.imageSize ? { size: requirements.imageSize } : {}),
        },
    };
    return { logicalModelID: cost.logicalModelId, intent };
}

function creditAmount(billingMode: "fixed_request" | "per_second", unitPriceMicrocredits: number, count?: string | number, seconds?: string | number) {
    const quantity = billingMode === "per_second" ? Math.max(1, Math.floor(Math.abs(Number(seconds)) || 1)) : Math.max(1, Math.floor(Math.abs(Number(count)) || 1));
    return (unitPriceMicrocredits / 1_000_000) * quantity;
}

function creditPricingForEntry(
    entry: Pick<ModelCreditCost, "billingMode" | "unitPriceMicrocredits" | "inputTokenPriceMicrocredits" | "outputTokenPriceMicrocredits" | "cachedTokenPriceMicrocredits">,
    options: Pick<RequestCreditPricingOptions, "capability" | "count" | "seconds">,
): RequestCreditPricing | null {
    if (entry.billingMode !== "token") {
        return { billingMode: entry.billingMode, estimatedCredits: creditAmount(entry.billingMode, entry.unitPriceMicrocredits, options.count, options.seconds) };
    }
    const input = validMicrocredits(entry.inputTokenPriceMicrocredits);
    const output = validMicrocredits(entry.outputTokenPriceMicrocredits);
    const cached = validMicrocredits(entry.cachedTokenPriceMicrocredits);
    if (input === null || output === null || cached === null) return null;
    const preferred = options.capability === "video" ? output : output > 0 ? output : input > 0 ? input : cached;
    return {
        billingMode: "token",
        perMillionCredits: preferred / 1_000_000,
        inputPerMillionCredits: input / 1_000_000,
        outputPerMillionCredits: output / 1_000_000,
        cachedPerMillionCredits: cached / 1_000_000,
    };
}

function validMicrocredits(value: number | undefined) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function sameCreditPricing(left: RequestCreditPricing, right: RequestCreditPricing | null) {
    if (!right || left.billingMode !== right.billingMode) return false;
    if (left.billingMode !== "token" && right.billingMode !== "token") return left.estimatedCredits === right.estimatedCredits;
    if (left.billingMode === "token" && right.billingMode === "token") {
        return (
            left.perMillionCredits === right.perMillionCredits &&
            left.inputPerMillionCredits === right.inputPerMillionCredits &&
            left.outputPerMillionCredits === right.outputPerMillionCredits &&
            left.cachedPerMillionCredits === right.cachedPerMillionCredits
        );
    }
    return false;
}

function priceSelectorForRequest(capability: ModelCapability | undefined, config: AiConfig, requirements?: ModelRequirements) {
    const requested: Record<string, string> = {};
    const requestOptions: Record<string, unknown> = { ...(capability ? modelRequestOptions(config, capability) : {}), ...(requirements?.options || {}) };
    if (capability === "video") {
        const input = requirements?.input;
        if (input) {
            const imageCount = (input.imageCount || 0) + (input.characterCount || 0);
            const operation = resolveVideoOperation(input, requirements?.videoOperation, requirements?.videoOperationExplicit);
            // 与服务端 SKU 选择保持一致：计价按实际输入素材归类，不受供应商执行操作名影响。
            requested.operation = input.videoCount > 0 ? "video_to_video" : imageCount > 0 ? "image_to_video" : operation;
            if (imageCount > 0) requested.imageCount = String(imageCount);
        }
        const resolution = normalizeTierResolution(String(requestOptions.vquality ?? requestOptions.resolution ?? config.vquality));
        if (resolution !== "*") requested.vquality = resolution;
        const seconds = Math.max(0, Math.floor(Number(requirements?.videoSeconds ?? requestOptions.videoSeconds ?? config.videoSeconds) || 0));
        if (seconds > 0) requested.videoSeconds = String(seconds);
    }
    if (capability === "image") {
        const quality = String(requestOptions.quality ?? config.quality ?? "");
        const size = String(requirements?.imageSize ?? requestOptions.size ?? config.size ?? "");
        if (quality && quality !== "auto") requested.quality = quality.toLowerCase();
        if (size && size !== "auto") requested.size = size.toLowerCase();
    }
    return requested;
}

function priceSelectorForTier(tier: ModelPriceTier) {
    const selector = { ...(tier.selector || {}) };
    if (!Object.keys(selector).length) {
        const resolution = normalizeTierResolution(tier.resolution);
        if (resolution !== "*") selector.vquality = resolution;
        if (tier.videoSeconds > 0) selector.videoSeconds = String(tier.videoSeconds);
    }
    return selector;
}

export function normalizeTierResolution(value: string) {
    const raw = String(value || "").trim();
    if (!raw || raw === "*") return "*";
    return videoResolutionComparisonKey(raw);
}
