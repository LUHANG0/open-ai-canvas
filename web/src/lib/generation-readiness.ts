import { modelCompatibilityError, type ModelRequirements } from "@/lib/model-selection";
import type { ModelProtocolDefinition } from "@/lib/model-protocols";
import { resolveGenerationWorkflowExecution, type GenerationWorkflowMode } from "@/lib/generation-workflow-execution";
import { hasSystemModelPrice, modelOptionName, normalizeModelOptionValue, resolveModelChannel, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

export type ProviderCatalogState =
    | { status: "loading" | "error" }
    | { status: "ready"; protocols: ModelProtocolDefinition[] };
export type GenerationReadiness = {
    ready: boolean;
    source: "platform" | "supplier";
    reason?: string;
    settingsHref?: string;
    retry?: "catalog";
};

// Readiness describes local prerequisites, not a promise that an upstream call will succeed.
// Keep credentials and prices server-authoritative for platform channels.
export function modelReadiness(config: AiConfig, value: string, capability?: ModelCapability, requirements?: ModelRequirements, catalog?: ProviderCatalogState): GenerationReadiness {
    const model = normalizeModelOptionValue(value, config.channels);
    const channel = resolveModelChannel(config, model);
    const source = channel.scope === "system" ? "platform" : "supplier";
    const settingsHref = `/settings?section=${source === "platform" ? "models" : "channels"}`;
    const unavailable = (reason: string): GenerationReadiness => ({ ready: false, source, reason, settingsHref });
    if (!model) return unavailable(value ? "当前模型已移除，请重新选择模型" : "请先选择模型");
    if (channel.enabled === false) return unavailable("当前渠道未启用，请切换模型或检查渠道设置");
    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(model));
    if (cost?.available === false) return unavailable("当前模型不可用，请切换模型或检查模型设置");
    if (source === "platform") {
        if (!hasSystemModelPrice(channel, modelOptionName(model))) return unavailable("当前模型未配置有效积分价格，请切换模型或联系管理员");
    } else {
        if (!channel.baseUrl.trim() || !channel.apiKey.trim()) return unavailable("个人渠道连接未配置完整，请填写 Base URL 和 API Key");
        const protocol = cost?.protocol?.trim() || channel.interfaceType?.trim();
        if (!protocol || protocol === "auto") return unavailable("当前模型未配置请求协议，请在个人渠道中选择协议");
        if (catalog?.status === "loading") return { ready: false, source, reason: "正在检查请求协议" };
        if (catalog?.status === "error") return { ready: false, source, reason: "请求协议目录读取失败，请重试", retry: "catalog" };
        if (catalog?.status === "ready") {
            const definition = catalog.protocols.find((item) => item.value === protocol && item.enabled !== false);
            if (!definition) return unavailable("当前请求协议未安装或未启用，请检查个人渠道");
            if (capability && definition.capability !== capability) return unavailable("请求协议与当前用途不匹配，请重新选择协议或模型");
        }
    }
    const error = modelCompatibilityError(config, model, requirements);
    return error ? unavailable(error) : { ready: true, source };
}

export function generationReadiness(config: AiConfig, value: string, mode: GenerationWorkflowMode, requirements?: ModelRequirements, catalog?: ProviderCatalogState): GenerationReadiness {
    // A selected workflow is an independent route; missing ordinary model configuration is irrelevant.
    try {
        if (resolveGenerationWorkflowExecution(config, mode)) return { ready: true, source: "supplier" };
    } catch (error) {
        return { ready: false, source: "supplier", reason: error instanceof Error ? error.message : "工作流配置不可用", settingsHref: "/settings?section=runninghub" };
    }
    return modelReadiness(config, value, mode, requirements, catalog);
}
