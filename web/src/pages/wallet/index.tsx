import { useEffect, useRef, useState, type ReactNode } from "react";
import { App, Button, Grid, Input, Segmented, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowDownLeft, ArrowUpRight, CalendarCheck, Coins, RefreshCw, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, TicketCheck } from "lucide-react";

import { formatCredits } from "@/constant/credits";
import { PageHeader, PaginationBar, TableSurface, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { SectionHeader, StatusBadge, Surface } from "@/components/ui/pc";
import { checkinCredits, getWallet, redeemCredits, type CreditLedgerEntry, type WalletSummary } from "@/services/api/wallet";
import { modelDisplayName, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";

import "./wallet-pc.css";

type LedgerFilter = "all" | "income" | "consume" | "refund";

const ledgerFilterOptions = [
    { label: "全部", value: "all" },
    { label: "充值与调整", value: "income" },
    { label: "模型消费", value: "consume" },
    { label: "退款", value: "refund" },
];

export default function WalletPage() {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const config = useEffectiveConfig();
    const [wallet, setWallet] = useState<WalletSummary | null>(null);
    const [code, setCode] = useState("");
    const [filter, setFilter] = useState<LedgerFilter>("all");
    const [loading, setLoading] = useState(false);
    const [redeeming, setRedeeming] = useState(false);
    const [checkingIn, setCheckingIn] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const requestSequence = useRef(0);

    const reload = async (targetPage = page, targetPageSize = pageSize) => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        try {
            const nextWallet = await getWallet(targetPage, targetPageSize, filter);
            if (sequence === requestSequence.current) setWallet(nextWallet);
        } catch (error) {
            if (sequence === requestSequence.current) message.error(error instanceof Error ? error.message : "读取积分记录失败");
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    };

    useEffect(() => {
        void reload(page, pageSize);
    }, [filter, page, pageSize]);

    const redeem = async () => {
        const normalized = code.trim().toLowerCase();
        if (normalized.length !== 32) {
            message.error("请输入完整的 32 位兑换码");
            return;
        }
        setRedeeming(true);
        try {
            await redeemCredits(normalized);
            setCode("");
            setPage(1);
            await reload(1, pageSize);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            message.success("兑换成功，积分已到账");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        } finally {
            setRedeeming(false);
        }
    };

    const checkin = async () => {
        setCheckingIn(true);
        try {
            await checkinCredits();
            await reload(page, pageSize);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            message.success("签到成功，积分已到账");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "签到失败");
        } finally {
            setCheckingIn(false);
        }
    };

    const entries = wallet?.entries || [];
    const account = wallet?.account;
    const totalMicrocredits = (account?.availableMicrocredits || 0) + (account?.reservedMicrocredits || 0);

    const columns: ColumnsType<CreditLedgerEntry> = [
        { title: "发生时间", dataIndex: "createdAt", width: 180, render: formatTime },
        { title: "类型", dataIndex: "type", width: 120, render: (type) => <LedgerTypeTag type={type} /> },
        {
            title: "明细",
            width: 400,
            ellipsis: true,
            render: (_, entry) => (
                <div className="wallet-ledger-entry min-w-0 max-w-full overflow-hidden" title={[ledgerModelName(config, entry), [sceneLabel(entry.scene), entry.note].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}>
                    <div className="wallet-ledger-entry-title truncate font-medium">{ledgerModelName(config, entry)}</div>
                    <div className="wallet-ledger-entry-note mt-1 truncate text-xs text-foreground/50">{[sceneLabel(entry.scene), entry.note].filter(Boolean).join(" · ") || "无补充说明"}</div>
                </div>
            ),
        },
        {
            title: "积分变化",
            dataIndex: "amountMicrocredits",
            width: 145,
            align: "right",
            render: (value: number) => <CreditDelta value={value} />,
        },
        { title: "变更后余额", dataIndex: "availableAfterMicrocredits", width: 145, align: "right", render: (value) => <span className="tabular-nums">{formatCredits(value)}</span> },
    ];

    return (
        <WorkspacePage className="library-page wallet-library-page" contentClassName="wallet-page-content">
            <div className="studio-band">
                <PageHeader
                    eyebrow="账户与计费"
                    title="积分中心"
                    description="模型调用、冻结与退款都在同一条可追溯流水中。"
                    meta={
                        <span className="app-projects-header-meta wallet-credit-meta">
                            <Coins className="size-3" />
                            可用 {formatCredits(account?.availableMicrocredits || 0, 6)}
                        </span>
                    }
                    actions={
                        <>
                            <Button
                                className="library-primary-action"
                                icon={<CalendarCheck className="size-4" />}
                                type={wallet?.policy.checkedInToday ? "default" : "primary"}
                                loading={checkingIn}
                                disabled={wallet?.policy.checkedInToday}
                                onClick={() => void checkin()}
                            >
                                {wallet?.policy.checkedInToday ? "今日已签到" : `签到 +${formatCredits(wallet?.policy.checkinBonusMicrocredits || 0)}`}
                            </Button>
                            <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void reload()}>
                                刷新余额
                            </Button>
                        </>
                    }
                />
            </div>

            <section className="library-feature-grid wallet-summary-grid">
                <Surface className="credit-balance-card" padding="none">
                    <div className="wallet-balance-inner">
                        <div className="wallet-balance-primary">
                            <span className="wallet-balance-eyebrow hidden">ACCOUNT BALANCE</span>
                            <div className="wallet-balance-heading">
                                <span className="library-icon-tile wallet-balance-icon">
                                    <Coins />
                                </span>
                                <div>
                                    <strong>可用创作积分</strong>
                                    <span>最近更新 {formatTime(account?.updatedAt)}</span>
                                </div>
                            </div>
                            <div>
                                <div className="wallet-balance-number" title={`${formatCredits(account?.availableMicrocredits || 0, 6)} 积分`}>
                                    <strong>{formatCredits(account?.availableMicrocredits || 0, 6)}</strong>
                                    <span>积分</span>
                                </div>
                                <span className="wallet-balance-precision hidden">账务精度保留至百万分之一积分</span>
                            </div>
                        </div>
                        <div className="wallet-balance-details">
                            <StatusBadge className="wallet-account-status" tone="success" icon={<ShieldCheck />}>
                                账户正常
                            </StatusBadge>
                            <BalanceMetric label="冻结积分" description="调用中或待核对" value={account?.reservedMicrocredits || 0} icon={<TicketCheck className="size-4" />} />
                            <BalanceMetric label="账户总额" description="可用与冻结合计" value={totalMicrocredits} icon={<Coins className="size-4" />} />
                        </div>
                    </div>
                </Surface>

                <Surface className="wallet-redeem-panel" padding="lg">
                    <div className="wallet-redeem-heading flex items-start gap-3">
                        <span className="wallet-redeem-icon grid size-9 shrink-0 place-items-center rounded-lg">
                            <TicketCheck className="size-4" />
                        </span>
                        <div className="wallet-redeem-copy">
                            <h2 className="text-base font-semibold">兑换积分</h2>
                            <p className="mt-1 text-xs leading-5 text-foreground/55">输入管理员发放的 32 位兑换码。</p>
                        </div>
                    </div>
                    <label className="mt-6 block">
                        <span className="text-xs font-medium text-foreground/70">兑换码</span>
                        <Input
                            className="mt-2 font-mono"
                            size="large"
                            value={code}
                            maxLength={32}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(event) => setCode(event.target.value.replace(/[-\s]/g, ""))}
                            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            onPressEnter={() => void redeem()}
                        />
                    </label>
                    <div className="mt-2 flex items-center justify-between text-xs text-foreground/45">
                        <span>兑换成功后立即到账</span>
                        <span className="tabular-nums">{code.length} / 32</span>
                    </div>
                    <Button className="mt-5" type="primary" size="large" block loading={redeeming} disabled={code.length !== 32} onClick={() => void redeem()}>
                        兑换积分
                    </Button>
                </Surface>
            </section>

            <Surface className="wallet-ledger-panel" padding="md">
                <SectionHeader
                    title="积分流水"
                    description={`当前展示最近 ${wallet?.entries.length || 0} 条记录。`}
                    actions={
                        <Segmented
                            block={!screens.sm}
                            value={filter}
                            options={ledgerFilterOptions}
                            onChange={(value) => {
                                setFilter(value as LedgerFilter);
                                setPage(1);
                            }}
                        />
                    }
                />

                {screens.md ? (
                    <TableSurface className="wallet-ledger-table-surface mt-0 rounded-xl border-border/70 bg-transparent">
                        <Table className="app-data-table wallet-ledger-table" rowKey="id" size="middle" loading={loading} columns={columns} dataSource={entries} pagination={false} tableLayout="fixed" scroll={{ x: 990 }} />
                    </TableSurface>
                ) : (
                    <div className="grid gap-1 overflow-hidden rounded-md bg-transparent">
                        {entries.length ? (
                            entries.map((entry) => <LedgerMobileRow key={entry.id} config={config} entry={entry} />)
                        ) : (
                            <WorkspaceState compact icon="wallet" title="没有匹配的积分记录" description="切换流水类型，或完成一次生成后再回来查看。" />
                        )}
                    </div>
                )}
                <PaginationBar
                    current={page}
                    pageSize={pageSize}
                    total={wallet?.total || 0}
                    pageSizeOptions={[20, 50, 100]}
                    onChange={(nextPage, nextPageSize) => {
                        setPage(nextPageSize !== pageSize ? 1 : nextPage);
                        setPageSize(nextPageSize);
                    }}
                />
            </Surface>
        </WorkspacePage>
    );
}

function BalanceMetric({ label, description, value, icon }: { label: string; description: string; value: number; icon: ReactNode }) {
    return (
        <div className="wallet-balance-metric">
            <span className="wallet-balance-metric-icon">{icon}</span>
            <div>
                <span>{label}</span>
                <strong title={`${formatCredits(value, 6)} 积分`}>{formatCredits(value, 6)}</strong>
                <small>{description}</small>
            </div>
        </div>
    );
}

function LedgerMobileRow({ config, entry }: { config: AiConfig; entry: CreditLedgerEntry }) {
    const meta = ledgerTypeMeta(entry.type);
    return (
        <article className="flex items-start gap-3 rounded-md bg-foreground/[.025] px-4 py-4">
            <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${meta.iconClass}`}>{meta.icon}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{ledgerModelName(config, entry)}</div>
                        <div className="mt-1 text-xs text-foreground/45">{formatTime(entry.createdAt)}</div>
                    </div>
                    <CreditDelta value={entry.amountMicrocredits} />
                </div>
                <div className="mt-2 line-clamp-2 break-words text-xs leading-5 text-foreground/55">{[sceneLabel(entry.scene), entry.note].filter(Boolean).join(" · ") || meta.label}</div>
            </div>
        </article>
    );
}

function CreditDelta({ value }: { value: number }) {
    const tone = value > 0 ? "is-positive" : value < 0 ? "is-negative" : "is-neutral";
    const colorClass = value > 0 ? "text-emerald-600 dark:text-emerald-400" : value < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground/60";
    return (
        <span className={`wallet-credit-delta shrink-0 font-medium tabular-nums ${tone} ${colorClass}`} title={`${value > 0 ? "+" : ""}${formatCredits(value, 6)} 积分`}>
            {value > 0 ? "+" : ""}
            {formatCredits(value, 6)}
        </span>
    );
}

function LedgerTypeTag({ type }: { type: CreditLedgerEntry["type"] }) {
    const meta = ledgerTypeMeta(type);
    return (
        <Tag className="wallet-ledger-type" variant="filled" color={meta.tagColor}>
            {meta.label}
        </Tag>
    );
}

function ledgerTypeMeta(type: CreditLedgerEntry["type"]) {
    const values = {
        redeem: { label: "兑换充值", tagColor: "default", icon: <ArrowDownLeft className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        admin_grant: { label: "管理员充值", tagColor: "default", icon: <ArrowDownLeft className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        consume: { label: "模型消费", tagColor: "error", icon: <Sparkles className="size-4" />, iconClass: "bg-rose-500/10 text-rose-600 dark:text-rose-300" },
        reserve: { label: "积分冻结", tagColor: "warning", icon: <ArrowUpRight className="size-4" />, iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-300" },
        refund: { label: "消费退款", tagColor: "warning", icon: <RotateCcw className="size-4" />, iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-300" },
        admin_adjustment: { label: "管理员调账", tagColor: "default", icon: <SlidersHorizontal className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        signup_bonus: { label: "注册奖励", tagColor: "default", icon: <Sparkles className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
        checkin_bonus: { label: "签到奖励", tagColor: "default", icon: <CalendarCheck className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" },
    } as const;
    return values[type] || { label: "其他积分变动", tagColor: "default", icon: <ArrowUpRight className="size-4" />, iconClass: "bg-foreground/8 text-foreground/70" };
}

function ledgerTitle(entry: CreditLedgerEntry) {
    if (entry.type === "redeem") return "兑换码充值";
    if (entry.type === "refund") return "模型消费退款";
    if (entry.type === "consume") return "模型调用";
    if (entry.type === "signup_bonus") return "新用户注册奖励";
    if (entry.type === "checkin_bonus") return "每日签到奖励";
    return entry.note || "积分调整";
}

function ledgerModelName(config: AiConfig, entry: CreditLedgerEntry) {
    return entry.model ? modelDisplayName(config, entry.model) : ledgerTitle(entry);
}

function sceneLabel(scene?: string) {
    const labels: Record<string, string> = { image: "图片生成", text: "文本生成", video: "视频生成", audio: "音频生成", storyboard: "分镜生成" };
    return scene ? labels[scene] || "其他场景" : "";
}

function formatTime(value?: string) {
    if (!value) return "--";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString("zh-CN", { hour12: false });
}
