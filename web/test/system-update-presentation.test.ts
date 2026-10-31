import { expect, test } from "bun:test";
import { formatUpdateComponent, formatUpdateDate, formatUpdateTime } from "../src/pages/admin/settings/system-update-presentation";

test("missing and Go zero timestamps stay unknown instead of appearing as ancient releases", () => {
    for (const value of [undefined, "", "invalid", "0001-01-01T00:00:00Z", "0001-01-01T00:00:00+00:00"]) {
        expect(formatUpdateDate(value)).toBe("—");
        expect(formatUpdateTime(value)).toBe("—");
    }
});

test("real release and operation timestamps retain their local date and time", () => {
    const value = "2026-10-31T06:54:17Z";
    expect(formatUpdateDate(value)).toBe(new Date(value).toLocaleString("zh-CN", { hour12: false }));
    expect(formatUpdateTime(value)).toBe(new Date(value).toLocaleTimeString("zh-CN", { hour12: false }));
});

test("legacy or partial component responses identify missing values without inventing a version", () => {
    expect(formatUpdateComponent()).toBe("版本未提供 · 提交未提供");
    expect(formatUpdateComponent({ version: "web-current" })).toBe("web-current · 提交未提供");
    expect(formatUpdateComponent({ commit: "63059245f3c157f639b19e9a2191ec110ae978a5" })).toBe("版本未提供 · 63059245f3c1");
    expect(formatUpdateComponent({ version: "backend-current", commit: "9c03fd9bf80cad3a7bada7a8f42406762474515c" })).toBe("backend-current · 9c03fd9bf80c");
});
