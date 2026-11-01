import { afterEach, expect, test } from "bun:test";
import { generationReadiness, modelReadiness } from "../src/lib/generation-readiness";
import { generationFee } from "../src/lib/generation-fee";
import { createModelChannel, defaultConfig, type AiConfig } from "../src/stores/use-config-store";
import { usePluginStore } from "../src/stores/use-plugin-store";
import { RUNNINGHUB_PLUGIN_ID } from "../src/lib/plugins/builtin/workflows";
import type { LogicalModelQuote } from "../src/services/api/logical-models";

const protocol = { value: "openai-image", label: "OpenAI Images", capability: "image" as const, enabled: true, create: "POST /v1/images/generations", contentType: "application/json", media: "Fixture" };
const catalog = { status: "ready" as const, protocols: [protocol] };
const fixture = (scope: "user" | "system" = "user"): AiConfig => ({ ...defaultConfig, model: "readiness::gpt-image-1", channels: [createModelChannel({ id: "readiness", scope, name: "Readiness", models: ["gpt-image-1"], baseUrl: "https://fixture.invalid/v1", apiKey: "fixture", modelCosts: [{ model: "gpt-image-1", capability: "image", protocol: "openai-image", billingMode: "fixed_request", unitPriceMicrocredits: 0 }] })] });
const check = (config: AiConfig, value = config.model) => modelReadiness(config, value, "image", undefined, catalog);
const pluginState = usePluginStore.getState().runtimeStatuses;
afterEach(() => usePluginStore.setState({ runtimeStatuses: pluginState }));

test("a personal channel requires actual connection and protocol rather than an inferred model name", () => {
    const config = fixture();
    expect(check(config).ready).toBe(true);
    config.channels[0].modelCosts = undefined;
    expect(check(config).reason).toContain("未配置请求协议");
    config.channels[0].interfaceType = "auto";
    expect(check(config).ready).toBe(false);
    config.channels[0].interfaceType = "openai-image";
    expect(check(config).ready).toBe(true);
    for (const field of ["baseUrl", "apiKey"] as const) {
        const missing = fixture(); missing.channels[0][field] = " ";
        expect(check(missing).reason).toContain("连接未配置完整");
        expect(check(missing).settingsHref).toBe("/settings?section=channels");
    }
});
test("removed model identities never fall back to the first valid channel", () => {
    const config = fixture();
    expect(check(config, "removed::gpt-image-1").reason).toContain("已移除");
    expect(check(config, "readiness::removed-model").ready).toBe(false);
    expect(check(config, "").reason).toBe("请先选择模型");
});
test("catalog loading, failure, disabled or mismatched protocols stay distinct and recover", () => {
    const config = fixture();
    expect(modelReadiness(config, config.model, "image", undefined, { status: "loading" }).reason).toContain("正在检查");
    const failed = modelReadiness(config, config.model, "image", undefined, { status: "error" });
    expect(failed.retry).toBe("catalog"); expect(failed.ready).toBe(false);
    for (const protocols of [[], [{ ...protocol, enabled: false }]]) expect(modelReadiness(config, config.model, "image", undefined, { status: "ready", protocols }).reason).toContain("未安装或未启用");
    expect(modelReadiness(config, config.model, "video", undefined, catalog).reason).toContain("用途不匹配");
    expect(check(config).ready).toBe(true);
});
test("platform routes do not depend on browser credentials or private protocol catalog", () => {
    const config = fixture("system");
    config.channels[0].baseUrl = ""; config.channels[0].apiKey = ""; config.channels[0].modelCosts![0].protocol = undefined;
    expect(modelReadiness(config, config.model, "image", undefined, { status: "error" }).ready).toBe(true);
    config.channels[0].enabled = false;
    expect(check(config).reason).toContain("渠道未启用");
    config.channels[0].enabled = true; config.channels[0].modelCosts![0].available = false;
    expect(check(config).reason).toContain("模型不可用");
});
test("platform zero remains valid, absent or invalid prices remain unavailable", () => {
    const config = fixture("system"); expect(check(config).ready).toBe(true);
    for (const amount of [undefined, NaN, Infinity, -1]) {
        config.channels[0].modelCosts![0].unitPriceMicrocredits = amount as number;
        expect(check(config).reason).toContain("未配置有效积分价格");
    }
});
test("reference and parameter compatibility remains part of readiness", () => {
    const config = fixture();
    const result = modelReadiness(config, config.model, "image", { capability: "image", input: { textCount: 1, imageCount: 1000, videoCount: 0, audioCount: 0, characterCount: 0 } }, catalog);
    expect(result.ready).toBe(false); expect(result.reason).toContain("参考图");
});
test("an enabled saved workflow bypasses ordinary model prerequisites, while text still uses its own model", () => {
    const config = fixture(); config.channels = []; config.model = ""; config.taskWorkflowProvider = "runninghub";
    config.runningHub = { ...config.runningHub, enabled: true, baseUrl: "https://fixture.invalid", apiKey: "fixture", workflowId: "saved-image", selectedKind: "workflow", workflows: [{ workflowId: "saved-image", kind: "workflow", capability: "image", fields: [] }] };
    usePluginStore.setState({ runtimeStatuses: { [RUNNINGHUB_PLUGIN_ID]: "enabled" } });
    expect(generationReadiness(config, "", "image", undefined, { status: "error" })).toEqual({ ready: true, source: "supplier" });
    expect(generationReadiness(config, "", "video").reason).toContain("当前节点是视频");
    expect(generationReadiness(config, "", "text").ready).toBe(false);
    config.runningHub.apiKey = "";
    expect(generationReadiness(config, "", "image").reason).toContain("积分 API Key");
    config.runningHub.apiKey = "fixture"; usePluginStore.setState({ runtimeStatuses: {} });
    expect(generationReadiness(config, "", "image").reason).toContain("插件未启用");
});

const quote: LogicalModelQuote = { logicalModelId: "quote", billingMode: "fixed_request", quantity: 1, amountMicrocredits: 0, estimated: false };
const feeInput = { source: "platform" as const, creditsEnabled: true, configuredCredits: 0, quoteRequired: true, quoteStatus: "ready" as const, quote };
test("supplier billing ignores platform defaults, quotes and the credits feature switch", () => {
    for (const creditsEnabled of [true, false]) {
        const fee = generationFee({ ...feeInput, source: "supplier", creditsEnabled });
        expect(fee.label).toBe("供应商计费"); expect(fee.description).toContain("供应商账单"); expect(fee.credits).toBeNull(); expect(fee.blocked).toBe(false);
    }
});
test("required pending or failed quotes never fall back to a cached zero", () => {
    const pending = generationFee({ ...feeInput, quoteStatus: "loading" });
    expect(pending.blocked).toBe(true); expect(pending.credits).toBeNull();
    const failed = generationFee({ ...feeInput, quoteStatus: "error" });
    expect(failed.retry).toBe("quote"); expect(failed.credits).toBeNull(); expect(failed.blocked).toBe(true);
    for (const amountMicrocredits of [NaN, -1, Infinity]) expect(generationFee({ ...feeInput, quote: { ...quote, amountMicrocredits } }).blocked).toBe(true);
    expect(generationFee(feeInput).credits).toBe(0); expect(generationFee(feeInput).blocked).toBe(false);
});
test("local explicit zero, missing amounts and token reservation explanations remain distinct", () => {
    const zero = generationFee({ ...feeInput, quoteRequired: false }); expect(zero.credits).toBe(0); expect(zero.label).toContain("0 积分");
    for (const configuredCredits of [null, NaN, Infinity, -1]) expect(generationFee({ ...feeInput, quoteRequired: false, configuredCredits }).label).toBe("积分金额待确认");
    expect(generationFee({ ...feeInput, quote: { ...quote, billingMode: "token", estimated: true, amountMicrocredits: 2_000_000 } }).description).toContain("预估金额并非费用上限");
    expect(generationFee({ ...feeInput, creditsEnabled: false, quoteStatus: "error" }).blocked).toBe(false);
});
