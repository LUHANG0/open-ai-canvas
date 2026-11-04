import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelLabel } from "../src/components/model-picker";
import { canvasThemes } from "../src/lib/canvas-theme";
import { createModelChannel, defaultConfig, type AiConfig } from "../src/stores/use-config-store";

const fixture = (scope: "user" | "system", unitPriceMicrocredits = 0): AiConfig => ({
    ...defaultConfig, model: "fee-source::gpt-image-1",
    channels: [createModelChannel({ id: "fee-source", name: "费用来源验收", scope, models: ["gpt-image-1"], modelCosts: [{ model: "gpt-image-1", capability: "image", protocol: "openai-image", billingMode: "fixed_request", unitPriceMicrocredits }] })],
});
const render = (config: AiConfig) => renderToStaticMarkup(<ModelLabel config={config} model={config.model} capability="image" theme={canvasThemes.light} creationVariant showConfiguredModelName={false} showPrice showDescription />);

test("personal channel defaults are supplier billing rather than free platform credits", () => {
    for (const amount of [0, 1_000_000]) {
        const html = render(fixture("user", amount));
        expect(html).toContain("供应商计费");
        expect(html).toContain("金额以供应商账单为准");
        expect(html).not.toContain("积分/次");
    }
});
test("an explicitly configured free platform model remains 0 credits", () => {
    expect(render(fixture("system"))).toContain("0 积分/次");
});
test("invalid platform amounts cannot masquerade as a quote", () => {
    for (const amount of [NaN, Infinity, -1]) {
        const html = render(fixture("system", amount));
        expect(html).toContain("未配置");
        expect(html).not.toContain("NaN");
        expect(html).not.toContain("∞");
        expect(html).not.toContain("-0.000001");
    }
});
