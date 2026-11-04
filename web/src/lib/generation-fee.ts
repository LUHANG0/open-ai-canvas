import { modelQuoteDescription } from "@/lib/model-pricing";
import type { LogicalModelQuote } from "@/services/api/logical-models";

export type GenerationFee = {
    label: string;
    description: string;
    credits: number | null;
    estimated: boolean;
    blocked: boolean;
    retry?: "quote";
};

export function generationFee(input: {
    source: "platform" | "supplier";
    creditsEnabled: boolean;
    configuredCredits: number | null;
    quoteRequired: boolean;
    quoteStatus: "loading" | "error" | "ready";
    quote?: LogicalModelQuote;
}): GenerationFee {
    const state = (label: string, description = label, blocked = false): GenerationFee => ({ label, description, credits: null, estimated: false, blocked });
    if (input.source === "supplier") return state("供应商计费", "通过个人渠道或工作流提交，金额以供应商账单为准");
    if (!input.creditsEnabled) return state("", "积分计费未启用");
    if (input.quoteRequired && input.quoteStatus === "loading") return state("正在计算积分", "正在读取当前参数的积分报价", true);
    if (input.quoteRequired && (input.quoteStatus === "error" || !validCredits(input.quote?.amountMicrocredits))) {
        return { ...state("积分报价读取失败，请重试", "尚未取得当前参数的有效报价，请重试后提交", true), retry: "quote" };
    }
    const quote = input.quoteRequired ? input.quote : undefined;
    const credits = quote ? quote.amountMicrocredits / 1_000_000 : input.configuredCredits;
    if (!validCredits(credits)) return state("积分金额待确认", "提交时由平台按请求与实际用量核定积分，当前没有可展示的金额");
    const estimated = !quote || quote.estimated;
    const label = `${estimated ? "预估" : "预计"} ${credits.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} 积分`;
    return { label, description: quote ? modelQuoteDescription(quote) : `${label}，最终以平台结算为准`, credits, estimated, blocked: false };
}
function validCredits(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
