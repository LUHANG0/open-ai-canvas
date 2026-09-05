import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Descriptions, Drawer, Empty, Spin, Tabs, Typography } from "antd";
import { RefreshCw } from "lucide-react";

import { formatCredits } from "@/constant/credits";
import { getAdminApiLog, queryAdminApiLogTask, type ApiCallLog } from "@/services/api/auth";
import { AdminStatusBadge, AdminTableEmpty } from "./admin-ui";
import "./admin-operations.css";

export function ApiLogDetailDrawer({ logId, onClose, onLogUpdated }: { logId: string | null; onClose: () => void; onLogUpdated?: (log: ApiCallLog) => void }) {
    const { message } = App.useApp();
    const [log, setLog] = useState<ApiCallLog | null>(null);
    const [loading, setLoading] = useState(false);
    const [querying, setQuerying] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [reloadNonce, setReloadNonce] = useState(0);
    const requestSequence = useRef(0);
    const queryInFlight = useRef(false);
    useEffect(() => {
        const sequence = ++requestSequence.current;
        if (!logId) return;
        setLoading(true);
        setLog(null);
        setDetailError("");
        void getAdminApiLog(logId)
            .then((result) => sequence === requestSequence.current && setLog(result.log))
            .catch((error) => sequence === requestSequence.current && setDetailError(error instanceof Error ? error.message : "读取请求详情失败"))
            .finally(() => sequence === requestSequence.current && setLoading(false));
        return () => {
            requestSequence.current++;
        };
    }, [logId, reloadNonce]);

    const queryProviderTask = async () => {
        if (!log || queryInFlight.current) return;
        queryInFlight.current = true;
        const sequence = requestSequence.current;
        setQuerying(true);
        setDetailError("");
        try {
            const result = await queryAdminApiLogTask(log.id);
            if (sequence !== requestSequence.current) return;
            if (result.recovered) {
                window.dispatchEvent(new CustomEvent("wallet:updated"));
                if (result.billingSettled) message.success("已获取上游视频，任务已恢复并完成结算");
                else message.warning("已获取上游视频，任务已恢复，计费状态待核对");
            } else {
                message.info(`上游任务仍在处理中${result.providerStatus ? `（${result.providerStatus}）` : ""}`);
            }
            try {
                const refreshed = await getAdminApiLog(log.id);
                if (sequence !== requestSequence.current) return;
                setLog(refreshed.log);
                onLogUpdated?.(refreshed.log);
            } catch (error) {
                if (sequence === requestSequence.current) setDetailError(`查询已完成，最新详情读取失败：${error instanceof Error ? error.message : "请重试读取"}。无需重复查询上游。`);
            }
        } catch (error) {
            if (sequence === requestSequence.current) setDetailError(`查询结果未确认：${error instanceof Error ? error.message : "查询上游任务失败"}。请先重新读取详情核对。`);
        } finally {
            queryInFlight.current = false;
            setQuerying(false);
        }
    };

    return (
        <Drawer
            title="请求详情"
            open={Boolean(logId)}
            onClose={() => {
                if (!querying) onClose();
            }}
            closable={!querying}
            keyboard={!querying}
            mask={{ closable: !querying }}
            size="min(920px, 100vw)"
            destroyOnHidden
            rootClassName="admin-drawer admin-api-log-drawer"
        >
            {loading ? (
                <div className="admin-credit-drawer-loading" role="status">
                    <Spin />
                    正在读取请求详情…
                </div>
            ) : log ? (
                <>
                    {detailError ? <Alert showIcon type="warning" title="详情待刷新" description={detailError} action={<Button onClick={() => setReloadNonce((value) => value + 1)}>重新读取</Button>} /> : null}
                    <LogDetail log={log} querying={querying} queryBlocked={Boolean(detailError)} onQueryProviderTask={queryProviderTask} />
                </>
            ) : (
                <AdminTableEmpty title={detailError ? "请求详情读取失败" : "没有请求详情"} description={detailError || undefined} action={detailError ? <Button onClick={() => setReloadNonce((value) => value + 1)}>重试</Button> : undefined} />
            )}
        </Drawer>
    );
}

function LogDetail({ log, querying, queryBlocked, onQueryProviderTask }: { log: ApiCallLog; querying: boolean; queryBlocked: boolean; onQueryProviderTask: () => void }) {
    const providerStatus = log.providerStatus?.toLowerCase();
    const processing = ["queued", "pending", "processing", "running", "in_progress"].includes(providerStatus || "");
    const failed = log.status === "failed" || ["failed", "cancelled", "expired"].includes(providerStatus || "");
    const items = [
        ["时间", new Date(log.startedAt || log.createdAt).toLocaleString("zh-CN", { hour12: false })],
        ["状态", <AdminStatusBadge label={failed ? "失败" : processing ? "处理中" : "成功"} tone={failed ? "error" : processing ? "warning" : "success"} />],
        [
            "用户",
            <span>
                {log.userDisplayName || log.userAccount || "未知用户"}
                {log.userAccount ? <span className="ml-2 text-foreground/45">@{log.userAccount}</span> : null}
            </span>,
        ],
        ["渠道 / 模型", `${log.channelName || "未记录渠道"} / ${log.model || "未识别模型"}`],
        ["能力", capabilityText(log.capability)],
        ["总耗时", formatDuration(log.durationMs)],
        ["视频轮询", log.capability === "video" ? `${log.pollCount || 0} 次` : "--"],
        ["Token", log.usageAvailable ? `${log.inputTokens} 输入 / ${log.outputTokens} 输出 / ${log.cachedTokens} 缓存` : "未返回"],
        ["积分计费", billingText(log)],
        ["上游成本", log.costAvailable ? `${log.currency || "USD"} ${(log.estimatedCostMicros / 1_000_000).toFixed(6)}` : "未配置成本"],
        ["错误信息", [log.errorCode, log.error].filter(Boolean).join(" · ") || "--"],
        ["方法与路径", `${log.method} ${log.path}`],
        ["请求 Content-Type", log.requestContentType || "--"],
        ["HTTP 状态", String(log.statusCode || "--")],
        ["任务 ID", log.taskId || "--"],
        ["供应商任务 ID", log.providerRequestId || "--"],
        ["上游地址", log.upstreamUrl || "--"],
    ].map(([label, children], index) => ({ key: String(index), label, children }));

    const canQueryProviderTask = log.capability === "video" && log.taskStatus === "failed" && Boolean(log.taskId && log.providerRequestId);

    return (
        <div className="admin-api-log-detail-stack">
            {canQueryProviderTask ? (
                <div className="space-y-2">
                    <p className="text-xs text-foreground/55">查询上游成功后可能恢复任务并完成积分结算，请核对当前任务。</p>
                    <Button icon={<RefreshCw className="size-4" />} loading={querying} disabled={queryBlocked} onClick={onQueryProviderTask}>
                        手动查询任务
                    </Button>
                </div>
            ) : null}
            <Descriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2 }} items={items} />
            <section>
                <div className="mb-2 text-sm font-semibold text-foreground/85">原始报文</div>
                <Tabs
                    items={[
                        { key: "request", label: "请求报文", children: <PayloadPanel value={log.requestBody} empty="该请求未记录请求报文" /> },
                        { key: "response", label: "响应报文", children: <PayloadPanel value={log.responseBody} empty="该请求未记录响应报文" /> },
                    ]}
                />
            </section>
        </div>
    );
}

function billingText(log: ApiCallLog) {
    if (!log.billingAvailable) return "未扣积分";
    const status = log.billingStatus || "reserved";
    const statusLabel = ({ settled: "已结算", refunded: "已退回", uncertain: "待核对", running: "运行中", reserved: "已预授权" } as const)[status];
    return `${formatCredits(log.billingAmountMicrocredits)} 积分 · ${statusLabel}`;
}

function PayloadPanel({ value, empty }: { value?: string; empty: string }) {
    if (!value) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
    return (
        <div className="relative">
            <div className="absolute right-3 top-2 z-10">
                <Typography.Text copyable={{ text: value }} className="text-xs text-foreground/50">
                    复制报文
                </Typography.Text>
            </div>
            <pre className="thin-scrollbar max-h-[46vh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border/70 bg-foreground/[.035] px-4 pb-4 pt-10 font-mono text-xs leading-5 text-foreground/75">{value}</pre>
        </div>
    );
}

function capabilityText(value: string) {
    return ({ text: "文本", image: "图片", video: "视频", audio: "音频" } as Record<string, string>)[value] || "未知";
}
function formatDuration(value: number) {
    if (value < 1_000) return `${value} ms`;
    if (value < 60_000) return `${(value / 1_000).toFixed(1)} 秒`;
    return `${Math.floor(value / 60_000)} 分 ${Math.round((value % 60_000) / 1_000)} 秒`;
}
