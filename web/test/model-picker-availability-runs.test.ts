import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelRecentHealthTrack } from "../src/components/model-picker";
import type { PublicChannelModelAvailability } from "../src/services/api/logical-models";

test("近期无调用数据不渲染占位点，有数据仅显示真实调用", () => {
    expect(renderToStaticMarkup(createElement(ModelRecentHealthTrack))).toBe("");
    expect(renderToStaticMarkup(createElement(ModelRecentHealthTrack, { availability: { recentResults: [] } as unknown as PublicChannelModelAvailability }))).toBe("");
    const markup = renderToStaticMarkup(createElement(ModelRecentHealthTrack, { availability: { recentResults: [true, false] } as unknown as PublicChannelModelAvailability }));
    expect(markup).toContain("最近 2 次调用：1 成功，1 失败");
    expect(markup.match(/class="model-picker-availability-pill /g)?.length).toBe(2);
    expect(markup).not.toContain("is-empty");
});
