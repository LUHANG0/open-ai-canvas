import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationStatusNotice } from "../src/components/generation-status";
import type { GenerationStatus } from "../src/hooks/use-generation-readiness";

const status: GenerationStatus = {
    ready: true,
    source: "platform",
    canSubmit: true,
    quote: undefined,
    fee: { label: "预计 2.4 积分", description: "当前参数报价", credits: 2.4, estimated: false, blocked: false },
    retryKind: undefined,
    retry: () => {},
};

test("an inline fee suppresses only the redundant normal notice, including a zero quote", () => {
    expect(renderToStaticMarkup(<GenerationStatusNotice status={status} />)).toContain("预计 2.4 积分");
    expect(renderToStaticMarkup(<GenerationStatusNotice status={status} feeShownInline />)).toBe("");
    expect(renderToStaticMarkup(<GenerationStatusNotice status={{ ...status, fee: { ...status.fee, credits: 0, label: "预计 0 积分" } }} feeShownInline />)).toBe("");
});

test("inline presentation preserves blocked quote guidance, settings and retry", () => {
    const html = renderToStaticMarkup(
        <GenerationStatusNotice
            status={{ ...status, ready: false, canSubmit: false, settingsHref: "/settings?section=models", retryKind: "quote", fee: { ...status.fee, credits: null, label: "积分报价读取失败，请重试", blocked: true } }}
            feeShownInline
        />,
    );
    expect(html).toContain("积分报价读取失败，请重试");
    expect(html).toContain("检查设置");
    expect(html).toContain(">重试</button>");
});

test("readiness reasons and supplier settlement notices survive inline fees", () => {
    expect(renderToStaticMarkup(<GenerationStatusNotice status={{ ...status, ready: false, reason: "当前模型不可用" }} feeShownInline />)).toContain("当前模型不可用");
    const html = renderToStaticMarkup(<GenerationStatusNotice status={{ ...status, source: "supplier", fee: { ...status.fee, credits: null, label: "供应商计费" } }} feeShownInline />);
    expect(html).toContain("金额以供应商账单为准");
});
