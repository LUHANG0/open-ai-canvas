import type { SystemUpdateRelease } from "@/services/api/system-update";

function updateDate(value?: string) {
    if (!value || /^0001-01-01(?:T|$)/.test(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUpdateDate(value?: string) {
    return updateDate(value)?.toLocaleString("zh-CN", { hour12: false }) ?? "—";
}

export function formatUpdateTime(value?: string) {
    return updateDate(value)?.toLocaleTimeString("zh-CN", { hour12: false }) ?? "—";
}

export function formatUpdateComponent(component?: Partial<NonNullable<SystemUpdateRelease["components"]>[string]>) {
    return `${component?.version || "版本未提供"} · ${component?.commit?.slice(0, 12) || "提交未提供"}`;
}
