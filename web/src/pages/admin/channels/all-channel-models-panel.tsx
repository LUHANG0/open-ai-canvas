import { Button, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Pencil, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { filterAllChannelModels } from "./all-channel-models-state";
import { ModelIcon } from "@/components/model-picker";
import { Select } from "@/components/ui/base/select";
import { type ModelProtocolDefinition } from "@/lib/model-protocols";
import { fetchPluginProviderCatalog } from "@/services/api/plugin-catalog";
import { listAdminAllChannelModels, type AdminChannelModelHealth, type AdminChannelModelListItem } from "@/services/api/wallet";
import type { ModelChannel } from "@/stores/use-config-store";
import { AdminDataTable, AdminStatusBadge, AdminTableEmpty, PaginationBar } from "../components/admin-ui";
import { AdminSearchInput } from "../components/admin-search-input";
import { ChannelModelCostSummary } from "../components/channel-model-cost-summary";
import { ChannelModelEditor } from "../components/channel-model-editor";
import { ChannelModelHealthCell, channelModelHealthKey } from "../components/channel-model-health";

type StatusFilter = "all" | "enabled" | "disabled" | "unhealthy";

const capabilityOptions = [
    { label: "全部能力", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

/**
 * 跨渠道模型视图：按模型名称一次查遍全部系统渠道。
 * 同一模型在不同渠道的行相邻排列，便于直接比较价格、稳定性和启停状态。
 */
export function AllChannelModelsPanel({
    channels,
    health,
    healthLoading,
    healthError,
    healthTruncated,
    onChanged,
    onOpenChannel,
}: {
    channels: ModelChannel[];
    health: Map<string, AdminChannelModelHealth>;
    healthLoading: boolean;
    healthError: string;
    healthTruncated: boolean;
    onChanged: () => Promise<void>;
    onOpenChannel: (channelId: string) => void;
}) {
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("q") || "";
    const capability = searchParams.get("capability") || "all";
    const status = (searchParams.get("modelStatus") as StatusFilter) || "all";
    const channelFilter = searchParams.get("modelChannel") || "all";
    const [items, setItems] = useState<AdminChannelModelListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [retry, setRetry] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [editing, setEditing] = useState<AdminChannelModelListItem | null>(null);
    const [protocols, setProtocols] = useState<ModelProtocolDefinition[]>([]);
    const [protocolLoading, setProtocolLoading] = useState(true);
    const [protocolError, setProtocolError] = useState("");
    const protocolSequence = useRef(0);

    const updateFilter = (patch: Record<string, string>) => {
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                Object.entries(patch).forEach(([key, value]) => {
                    if (!value || value === "all") next.delete(key);
                    else next.set(key, value);
                });
                return next;
            },
            { replace: true },
        );
        setPage(1);
    };

    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError("");
        void listAdminAllChannelModels()
            .then((result) => active && setItems(result.models))
            .catch((error) => active && setLoadError(error instanceof Error ? error.message : "读取模型列表失败"))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [retry]);

    const loadProtocols = async () => {
        const sequence = ++protocolSequence.current;
        setProtocolLoading(true);
        setProtocolError("");
        try {
            const result = await fetchPluginProviderCatalog("admin.system-channel");
            if (sequence === protocolSequence.current) setProtocols(result);
        } catch (error) {
            if (sequence !== protocolSequence.current) return;
            setProtocols([]);
            setProtocolError(error instanceof Error ? error.message : "无法读取协议目录");
        } finally {
            if (sequence === protocolSequence.current) setProtocolLoading(false);
        }
    };

    useEffect(() => {
        void loadProtocols();
        return () => {
            protocolSequence.current += 1;
        };
    }, []);

    const filtered = useMemo(() => {
        return filterAllChannelModels(items, { keyword, capability, channelFilter, status }, health, Boolean(healthError) || healthLoading);
    }, [capability, channelFilter, health, healthError, healthLoading, items, keyword, status]);

    const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
    const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const enabledCount = filtered.filter((item) => item.enabled && item.channelEnabled).length;

    const openEditor = (item: AdminChannelModelListItem) => setEditing(item);

    const editingChannel = editing ? channels.find((channel) => channel.id === editing.channelId) : undefined;

    const columns: ColumnsType<AdminChannelModelListItem> = [
        {
            title: "模型",
            width: 240,
            fixed: "left",
            render: (_, item) => (
                <div className="flex min-w-0 items-center gap-2">
                    <span className="admin-channel-model-icon">
                        <ModelIcon model={item.modelKey} icon={item.icon} />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate font-medium" title={item.displayName || item.modelKey}>
                            {item.displayName || item.modelKey}
                        </div>
                        <div className="admin-monospace truncate text-xs text-foreground/45">{item.modelKey}</div>
                        {item.providerModelKey && item.providerModelKey !== item.modelKey ? (
                            <div className="admin-monospace truncate text-xs text-foreground/45" title={item.providerModelKey}>
                                上游：{item.providerModelKey}
                            </div>
                        ) : null}
                        {item.channelLabel ? <div className="truncate text-xs text-foreground/60">渠道展示名：{item.channelLabel}</div> : null}
                    </div>
                </div>
            ),
        },
        {
            title: "渠道",
            width: 170,
            render: (_, item) => (
                <div className="min-w-0">
                    <button type="button" className="admin-table-primary-link truncate" onClick={() => onOpenChannel(item.channelId)} title="在渠道中查看">
                        {item.channelName}
                    </button>
                    {!item.channelEnabled ? <div className="text-xs text-foreground/45">渠道已停用</div> : null}
                </div>
            ),
        },
        { title: "能力", dataIndex: "capability", width: 72, render: (value: string) => capabilityOptions.find((option) => option.value === value)?.label || "待配置" },
        {
            title: "请求稳定性（24h）",
            key: "health",
            width: 150,
            render: (_, item) => <ChannelModelHealthCell health={health.get(channelModelHealthKey(item.channelId, item.modelKey))} loading={healthLoading} error={healthError} truncated={healthTruncated} />,
        },
        { title: "规格成本价 / 销售价 / 加价", width: 300, render: (_, item) => <ChannelModelCostSummary item={item} /> },
        {
            title: "状态",
            width: 90,
            render: (_, item) => (item.enabled ? item.channelEnabled ? <AdminStatusBadge label="启用" tone="success" /> : <AdminStatusBadge label="渠道停用" tone="warning" /> : <AdminStatusBadge label="停用" tone="neutral" />),
        },
        {
            title: "操作",
            width: 150,
            fixed: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEditor(item)}>
                        编辑
                    </Button>
                </Space>
            ),
        },
    ];

    const hasFilters = Boolean(keyword || capability !== "all" || status !== "all" || channelFilter !== "all");

    return (
        <div className="admin-all-models">
            {loadError ? (
                <div className="admin-inline-load-error" role="alert">
                    <span>
                        模型列表读取失败{items.length ? "，当前显示上次读取的数据" : ""}：{loadError}
                    </span>
                    <Button size="small" onClick={() => setRetry((value) => value + 1)}>
                        重试
                    </Button>
                </div>
            ) : null}
            <AdminDataTable
                toolbar={
                    <AdminSearchInput
                        allowClear
                        autoFocus
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        aria-label="按模型名称搜索全部渠道"
                        placeholder="按模型名称、标识或上游 ID 搜索全部渠道"
                        onValueChange={(value) => updateFilter({ q: value })}
                    />
                }
                toolbarFilters={
                    <>
                        <Select aria-label="筛选模型能力" className="w-28" value={capability} options={capabilityOptions} onChange={(value) => updateFilter({ capability: value })} />
                        <Select
                            aria-label="筛选模型状态"
                            className="w-44"
                            value={status}
                            options={[
                                { label: "全部状态", value: "all" },
                                { label: "可用（模型与渠道均启用）", value: "enabled" },
                                { label: "不可用", value: "disabled" },
                                { label: "24h 成功率低于 80%", value: "unhealthy", disabled: Boolean(healthError) || healthLoading },
                            ]}
                            onChange={(value) => updateFilter({ modelStatus: value })}
                        />
                        <Select
                            aria-label="筛选渠道"
                            className="w-40"
                            showSearch
                            optionFilterProp="label"
                            value={channelFilter}
                            options={[{ label: "全部渠道", value: "all" }, ...channels.map((channel) => ({ label: channel.name, value: channel.id }))]}
                            onChange={(value) => updateFilter({ modelChannel: value })}
                        />
                    </>
                }
                toolbarActive={hasFilters}
                onReset={() => updateFilter({ q: "", capability: "", modelStatus: "", modelChannel: "" })}
                trailing={
                    <Space wrap>
                        <span className="text-xs text-foreground/50 tabular-nums">{loading ? "读取中…" : `${filtered.length} 个模型 · ${enabledCount} 个可用`}</span>
                        <Button size="small" loading={loading} onClick={() => setRetry((value) => value + 1)}>
                            刷新模型
                        </Button>
                    </Space>
                }
                table={{ className: "app-data-table", rowKey: "id", size: "small", loading, columns, dataSource: paged, pagination: false, scroll: { x: 1180 } }}
                empty={
                    <AdminTableEmpty
                        filtered={hasFilters && !loadError}
                        title={loadError ? "模型列表暂不可用" : status === "unhealthy" && (healthError || healthLoading) ? "请求稳定性尚未就绪" : hasFilters ? undefined : "还没有任何渠道模型"}
                        description={loadError ? "请点击上方重试。" : status === "unhealthy" && (healthError || healthLoading) ? "请刷新稳定性或清除状态筛选。" : undefined}
                    />
                }
                footer={
                    <PaginationBar
                        alwaysShow
                        current={currentPage}
                        pageSize={pageSize}
                        total={filtered.length}
                        onChange={(nextPage, nextPageSize) => {
                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                            setPageSize(nextPageSize);
                        }}
                    />
                }
            />
            {editing && editingChannel ? (
                <ChannelModelEditor
                    channel={editingChannel}
                    editing={editing}
                    protocols={protocols}
                    protocolLoading={protocolLoading}
                    protocolError={protocolError}
                    onRetryProtocols={() => void loadProtocols()}
                    onClose={() => setEditing(null)}
                    onSaved={async () => {
                        setRetry((value) => value + 1);
                        await onChanged();
                    }}
                />
            ) : null}
        </div>
    );
}
