import { expect, test } from "bun:test";
import { logBillingAmounts, logBillingText } from "../src/pages/admin/logs/log-view";

test("reserved and uncertain orders do not display a settled charge", () => {
    for (const billingStatus of ["reserved", "running", "uncertain"] as const) {
        const log = { billable: true, billingAvailable: true, billingStatus, billingAmountMicrocredits: 900000, billingReservedMicrocredits: 900000 };
        expect(logBillingAmounts(log)).toEqual({ reserved: 900000, settled: undefined });
        expect(logBillingText(log)).toContain("预授权 0.9 积分");
        expect(logBillingText(log)).toContain("实收 未结算");
    }
});

test("settled zero is an explicit zero; unavailable data stays unknown", () => {
    const log = { billable: true, billingAvailable: true, billingStatus: "settled" as const, billingReservedMicrocredits: 1000000, billingSettledMicrocredits: 0, billingAmountMicrocredits: 0 };
    expect(logBillingAmounts(log)).toEqual({ reserved: 1000000, settled: 0 });
    expect(logBillingText(log)).toContain("实收 0 积分");
    expect(logBillingAmounts({ ...log, billingAvailable: false })).toEqual({ reserved: undefined, settled: undefined });
    expect(logBillingText({ ...log, billable: false })).toBe("不计费");
});

test("older API fallback respects settlement status and refund semantics", () => {
    const log = { billable: true, billingAvailable: true, billingAmountMicrocredits: 780000 };
    expect(logBillingAmounts({ ...log, billingStatus: "settled" })).toEqual({ reserved: undefined, settled: 780000 });
    expect(logBillingAmounts({ ...log, billingStatus: "reserved" })).toEqual({ reserved: 780000, settled: undefined });
    expect(logBillingAmounts({ ...log, billingStatus: "refunded", billingAmountMicrocredits: 0 })).toEqual({ reserved: undefined, settled: undefined });
});
