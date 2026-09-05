import type { PluginState } from "@/services/api/plugins";

/** 用户开关、平台开放和实际生效是三个不同状态。未知状态不能从本机缓存推断为可用。 */
export function pluginDisplayState(state?: PluginState, unavailable = false) {
    if (!state || unavailable) return { label: "状态待确认", tone: "neutral" as const, enabled: false, userEnabled: state?.userEnabled ?? false };
    if (!state.platformAvailable) return { label: state.blockedReason || "运行环境不可用", tone: "warning" as const, enabled: false, userEnabled: state.userEnabled };
    if (state.effectiveEnabled) return { label: "已生效", tone: "success" as const, enabled: true, userEnabled: state.userEnabled };
    return { label: state.blockedReason || (state.userEnabled ? "已开启，待配置" : "已停用"), tone: state.userEnabled ? ("warning" as const) : ("neutral" as const), enabled: false, userEnabled: state.userEnabled };
}

export function normalizeEagleAddress(value: string) {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new Error("请输入有效的 Eagle 本机地址");
    }
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "41595" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
        throw new Error("Eagle 仅支持 HTTP 本机地址与默认端口 41595，例如 http://localhost:41595");
    }
    return url.origin;
}
