// 运营总览 KPI 卡片的「较前一日」比较，取趋势数据最后两天。

export function formatNumber(value: number) {
    return new Intl.NumberFormat("zh-CN", { notation: value >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

// 最近一天还没有数据（通常是今天刚开始）时不做比较，避免显示「较前一日 ↓ 100.0%」。
export function formatCountDelta(current?: number, previous?: number) {
    if (current === undefined || previous === undefined || current === 0) return undefined;
    const delta = current - previous;
    const direction = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
    const value = previous === 0 ? formatNumber(Math.abs(delta)) : `${Math.abs((delta / previous) * 100).toFixed(1)}%`;
    return { value: `较前一日 ${direction} ${value}`, tone: delta >= 0 ? ("success" as const) : ("warning" as const) };
}

// 无已完成样本时成功率为 null；同时保留旧接口按请求数判空的兼容保护。
export function formatRateDelta(current?: number | null, previous?: number | null, currentRequests?: number, previousRequests?: number) {
    if (current == null || previous == null || !currentRequests || !previousRequests) return undefined;
    const delta = current - previous;
    const direction = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
    return { value: `较前一日 ${direction} ${Math.abs(delta).toFixed(1)}pp`, tone: delta >= 0 ? ("success" as const) : ("warning" as const) };
}
