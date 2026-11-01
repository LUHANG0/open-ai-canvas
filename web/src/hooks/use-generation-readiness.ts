import { useQuery } from "@tanstack/react-query";
import { appQueryClient } from "@/lib/query-client";
import { generationReadiness, modelReadiness, type ProviderCatalogState } from "@/lib/generation-readiness";
import { generationFee } from "@/lib/generation-fee";
import { modelQuoteRequest, requestCreditCost } from "@/lib/model-pricing";
import type { ModelRequirements } from "@/lib/model-selection";
import { fetchPluginProviderCatalog } from "@/services/api/plugin-catalog";
import { quoteModel } from "@/services/api/logical-models";
import { modelOptionName, resolveModelChannel, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { usePluginStore } from "@/stores/use-plugin-store";
import { useUserStore } from "@/stores/use-user-store";

export function useGenerationProviderCatalog(needed: boolean) {
    const userId = useUserStore((state) => state.user?.id);
    const query = useQuery({
        queryKey: ["generation-provider-catalog", userId],
        queryFn: ({ signal }) => fetchPluginProviderCatalog("user.custom-channel", undefined, signal),
        enabled: Boolean(userId) && needed,
        staleTime: 30_000,
        retry: false,
    }, appQueryClient);
    const catalog: ProviderCatalogState | undefined = !userId || !needed ? undefined
        : query.isError ? { status: "error" }
        : query.data ? { status: "ready", protocols: query.data }
        : { status: "loading" };
    return { catalog, retry: () => { void query.refetch(); } };
}

// Both cache keys include account scope. A late response after switching accounts or parameters
// cannot become the new account/model's readiness or quote. Queries pass cancellation to HTTP.
export function useGenerationReadiness(config: AiConfig, value: string, mode: ModelCapability, requirements?: ModelRequirements, count = 1, seconds: string | number = 1) {
    const userId = useUserStore((state) => state.user?.id);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    usePluginStore((state) => state.runtimeStatuses);
    const workflowRoute = mode !== "text" && config.taskWorkflowProvider && config.taskWorkflowProvider !== "model";
    const provider = useGenerationProviderCatalog(!workflowRoute && modelReadiness(config, value, mode, requirements).source === "supplier");
    const readiness = generationReadiness(config, value, mode, requirements, provider.catalog);
    const request = readiness.ready && readiness.source === "platform" && creditsEnabled ? modelQuoteRequest(config, value, mode, requirements) : undefined;
    const query = useQuery({
        queryKey: ["generation-quote", userId, request],
        queryFn: ({ signal }) => quoteModel(request!, signal),
        enabled: Boolean(userId && request),
        staleTime: 15_000,
        retry: false,
    }, appQueryClient);
    const channel = resolveModelChannel(config, value);
    const fee = generationFee({
        source: readiness.source,
        creditsEnabled,
        configuredCredits: requestCreditCost({ channelMode: channel.scope === "system" ? "remote" : "local", modelCosts: channel.modelCosts, model: modelOptionName(value), capability: mode, config, requirements, count, seconds }),
        quoteRequired: Boolean(request),
        quoteStatus: query.isError ? "error" : query.data ? "ready" : "loading",
        quote: query.data?.quote,
    });
    return { ...readiness, quote: request ? query.data?.quote : undefined, fee, retryKind: readiness.retry || fee.retry, canSubmit: readiness.ready && !fee.blocked, retry: readiness.retry === "catalog" ? provider.retry : () => { void query.refetch(); } };
}
export type GenerationStatus = ReturnType<typeof useGenerationReadiness>;
