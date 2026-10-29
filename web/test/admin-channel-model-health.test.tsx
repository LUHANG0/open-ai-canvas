import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChannelModelHealthCell, channelModelHealthKey } from "../src/pages/admin/components/channel-model-health";
import { filterAllChannelModels } from "../src/pages/admin/channels/all-channel-models-state";
import type { AdminChannelModelHealth, AdminChannelModelListItem } from "../src/services/api/wallet";

const stats: AdminChannelModelHealth = { channelId: "a", modelKey: "same", requests24h: 2, succeeded24h: 0, failed24h: 2, successRate24h: 0, requests7d: 3, successRate7d: 1 / 3, p95DurationMs24h: 350, recentResults: [true, false, false] };
const item: AdminChannelModelListItem = {
    id: "a-model",
    channelId: "a",
    channelName: "主渠道",
    channelEnabled: true,
    modelKey: "same",
    displayName: "同一模型",
    providerModelKey: "vendor-image",
    channelLabel: "低价规格",
    icon: "",
    capability: "image",
    enabled: true,
    billingMode: "fixed_request",
    unitPriceMicrocredits: 0,
    inputTokenPriceMicrocredits: 0,
    outputTokenPriceMicrocredits: 0,
    cachedTokenPriceMicrocredits: 0,
    priceConfigured: false,
    priceVersion: 9,
    priceTiers: [],
    createdAt: "",
    updatedAt: "",
};
const other = { ...item, id: "b-model", channelId: "b", channelName: "备用渠道", channelEnabled: false };
const models = [other, item];
const health = new Map([[channelModelHealthKey("a", "same"), stats]]);
const defaults = { keyword: "", capability: "all", channelFilter: "all", status: "all" };

test("health errors, loading, incomplete samples and no completed requests remain distinct", () => {
    expect(renderToStaticMarkup(<ChannelModelHealthCell loading />)).toContain("读取中");
    const error = renderToStaticMarkup(<ChannelModelHealthCell error="request failed" />);
    expect(error).toContain("读取失败");
    expect(error).not.toContain("无已完成请求");
    expect(renderToStaticMarkup(<ChannelModelHealthCell />)).toContain("近 7 天无已完成请求");
    expect(renderToStaticMarkup(<ChannelModelHealthCell truncated />)).toContain("样本不完整");
});

test("a real zero rate and a day without completed outcomes have different labels", () => {
    const failed = renderToStaticMarkup(<ChannelModelHealthCell health={stats} />);
    expect(failed).toContain("0%");
    expect(failed).toContain('data-tone="error"');
    expect(failed).toContain("2 次");
    expect(failed.match(/is-failed/g)?.length).toBe(2);
    expect(failed.match(/is-success/g)?.length).toBe(1);
    const older = renderToStaticMarkup(<ChannelModelHealthCell health={{ ...stats, requests24h: 0, successRate24h: null }} />);
    expect(older).toContain("24h 无样本");
    expect(older).toContain('data-tone="neutral"');
    expect(renderToStaticMarkup(<ChannelModelHealthCell health={stats} truncated />)).toContain("部分样本");
});

test("cross-channel search matches display, upstream ID, channel label and channel name", () => {
    for (const keyword of [" 同一模型 ", "VENDOR-IMAGE", "低价规格", "same"]) {
        expect(filterAllChannelModels(models, { ...defaults, keyword }, health)).toEqual([other, item].sort((a, b) => a.channelName.localeCompare(b.channelName, "zh-CN")));
    }
    expect(filterAllChannelModels(models, { ...defaults, keyword: "主渠道" }, health)).toEqual([item]);
    expect(filterAllChannelModels(models, { ...defaults, keyword: "missing" }, health)).toEqual([]);
    expect(models).toEqual([other, item]); // Sorting must not mutate the server snapshot.
});

test("availability includes both model and channel state; filters can be combined", () => {
    expect(filterAllChannelModels(models, { ...defaults, status: "enabled" }, health)).toEqual([item]);
    expect(filterAllChannelModels(models, { ...defaults, status: "disabled" }, health)).toEqual([other]);
    expect(filterAllChannelModels(models, { ...defaults, channelFilter: "a", capability: "image" }, health)).toEqual([item]);
    expect(filterAllChannelModels(models, { ...defaults, capability: "video" }, health)).toEqual([]);
    expect(filterAllChannelModels([{ ...item, enabled: false }], { ...defaults, status: "disabled" }, health)).toHaveLength(1);
});

test("poor-health filtering excludes missing, pending and unreadable samples", () => {
    const filters = { ...defaults, status: "unhealthy" };
    expect(filterAllChannelModels(models, filters, health)).toEqual([item]);
    expect(filterAllChannelModels(models, filters, health, true)).toEqual([]);
    expect(filterAllChannelModels(models, filters, new Map())).toEqual([]);
    expect(filterAllChannelModels(models, filters, new Map([[channelModelHealthKey("a", "same"), { ...stats, successRate24h: null }]]))).toEqual([]);
    expect(filterAllChannelModels(models, filters, new Map([[channelModelHealthKey("a", "same"), { ...stats, successRate24h: 0.8 }]]))).toEqual([]);
});
