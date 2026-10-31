import type { AdminChannelModelHealth, AdminChannelModelListItem } from "@/services/api/wallet";
import { channelModelHealthKey } from "../components/channel-model-health";

export type ModelSearchFilters = { keyword: string; capability: string; channelFilter: string; status: string };

export function filterAllChannelModels(items: AdminChannelModelListItem[], { keyword, capability, channelFilter, status }: ModelSearchFilters, health: Map<string, AdminChannelModelHealth>, healthUnavailable = false) {
    const query = keyword.trim().toLowerCase();
    return items
        .filter((item) => {
            if (query && !`${item.modelKey} ${item.providerModelKey} ${item.displayName} ${item.channelLabel || ""} ${item.channelName}`.toLowerCase().includes(query)) return false;
            if (capability !== "all" && item.capability !== capability) return false;
            if (channelFilter !== "all" && item.channelId !== channelFilter) return false;
            if (status === "enabled" && !(item.enabled && item.channelEnabled)) return false;
            if (status === "disabled" && item.enabled && item.channelEnabled) return false;
            if (status === "unhealthy") {
                const stats = health.get(channelModelHealthKey(item.channelId, item.modelKey));
                if (healthUnavailable || !stats || stats.successRate24h === null || stats.successRate24h >= 0.8) return false;
            }
            return true;
        })
        .sort((left, right) => (left.displayName || left.modelKey).localeCompare(right.displayName || right.modelKey, "zh-CN") || left.modelKey.localeCompare(right.modelKey) || left.channelName.localeCompare(right.channelName, "zh-CN"));
}
