import { App, Button, Drawer, Empty, Input, Pagination, Popconfirm, Segmented, Select, Spin, Tabs, Tag } from "antd";
import { Check, Clipboard, Link2, RefreshCw, RotateCcw, ShieldAlert, UserCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { createRegistrationInvite, listRegistrationInvites, revokeRegistrationInvite, type RegistrationInvite, type RegistrationInviteStatus } from "@/services/api/auth";

const pageSize = 10;
const statusCopy: Record<RegistrationInvite["status"], { label: string; color: string }> = {
    pending: { label: "待使用", color: "blue" },
    used: { label: "已使用", color: "green" },
    expired: { label: "已过期", color: "default" },
    revoked: { label: "已撤销", color: "red" },
};

export function RegistrationInviteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message, modal } = App.useApp();
    const [tab, setTab] = useState("create");
    const [expiresInDays, setExpiresInDays] = useState<1 | 3 | 7>(7);
    const [note, setNote] = useState("");
    const [creating, setCreating] = useState(false);
    const [generatedLink, setGeneratedLink] = useState("");
    const [copied, setCopied] = useState(false);
    const [status, setStatus] = useState<RegistrationInviteStatus | "all">("all");
    const [page, setPage] = useState(1);
    const [invites, setInvites] = useState<RegistrationInvite[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    const loadInvites = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listRegistrationInvites({ status, page, limit: pageSize });
            setInvites(result.invites);
            setTotal(result.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取邀请记录失败");
        } finally {
            setLoading(false);
        }
    }, [message, page, status]);

    useEffect(() => {
        if (open) void loadInvites();
    }, [loadInvites, open]);

    useEffect(() => {
        if (open) return;
        setTab("create");
        setExpiresInDays(7);
        setNote("");
        setGeneratedLink("");
        setCopied(false);
        setStatus("all");
        setPage(1);
    }, [open]);

    const requestClose = () => {
        const hasDraft = note.trim() !== "" || expiresInDays !== 7;
        if (!generatedLink && !hasDraft) {
            onClose();
            return;
        }
        modal.confirm({
            title: generatedLink ? "关闭后将无法再查看该链接" : "放弃未保存的邀请？",
            content: generatedLink ? "原始邀请链接只在创建成功后显示这一次，请确认已复制到安全的分享渠道。" : "当前有效期或备注修改将丢失。",
            okText: "确认关闭",
            cancelText: "继续编辑",
            onOk: onClose,
        });
    };

    const createInvite = async () => {
        setCreating(true);
        try {
            const result = await createRegistrationInvite({ expiresInDays, note: note.trim() || undefined });
            const url = new URL("/register", window.location.origin);
            url.searchParams.set("invite", result.token);
            setGeneratedLink(url.toString());
            setCopied(false);
            setNote("");
            setExpiresInDays(7);
            setPage(1);
            await loadInvites();
            message.success("邀请链接已生成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建邀请失败");
        } finally {
            setCreating(false);
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(generatedLink);
            setCopied(true);
            message.success("邀请链接已复制");
        } catch {
            setCopied(false);
            message.error("复制失败，请手动选中链接复制");
        }
    };

    const revoke = async (invite: RegistrationInvite) => {
        try {
            const result = await revokeRegistrationInvite(invite.id);
            setInvites((items) => items.map((item) => (item.id === invite.id ? result.invite : item)));
            message.success("邀请已撤销");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "撤销邀请失败");
        }
    };

    return (
        <Drawer title="邀请注册" open={open} width="min(640px, 100vw)" onClose={requestClose} keyboard destroyOnHidden styles={{ body: { padding: 0 } }}>
            <Tabs
                activeKey={tab}
                onChange={setTab}
                className="h-full"
                tabBarStyle={{ paddingInline: 24, marginBottom: 0 }}
                items={[
                    {
                        key: "create",
                        label: "创建邀请",
                        children: (
                            <div className="space-y-5 p-4 sm:p-6">
                                <div className="rounded-xl border border-border bg-muted/25 p-4">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                                        <ShieldAlert className="size-4 text-primary" />
                                        单次安全邀请
                                    </div>
                                    <p className="m-0 text-xs leading-5 text-muted-foreground">每个链接只能注册一名普通用户，可随时撤销；即使公开注册关闭，有效邀请仍可使用。</p>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium" htmlFor="registration-invite-expiry">
                                        有效期
                                    </label>
                                    <Segmented
                                        id="registration-invite-expiry"
                                        block
                                        value={expiresInDays}
                                        options={[
                                            { label: "1 天", value: 1 },
                                            { label: "3 天", value: 3 },
                                            { label: "7 天", value: 7 },
                                        ]}
                                        onChange={(value) => setExpiresInDays(value as 1 | 3 | 7)}
                                        disabled={creating || Boolean(generatedLink)}
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium" htmlFor="registration-invite-note">
                                        备注 <span className="font-normal text-muted-foreground">（可选）</span>
                                    </label>
                                    <Input.TextArea
                                        id="registration-invite-note"
                                        value={note}
                                        maxLength={500}
                                        showCount
                                        rows={3}
                                        placeholder="例如：九月新成员"
                                        onChange={(event) => setNote(event.target.value)}
                                        disabled={creating || Boolean(generatedLink)}
                                    />
                                </div>
                                <Button type="primary" block size="large" icon={<Link2 className="size-4" />} loading={creating} disabled={Boolean(generatedLink)} onClick={() => void createInvite()}>
                                    生成邀请链接
                                </Button>

                                {generatedLink ? (
                                    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-4" role="status" aria-live="polite">
                                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                                            <UserCheck className="size-4" />
                                            邀请链接已就绪
                                        </div>
                                        <p className="m-0 text-xs leading-5 text-muted-foreground">
                                            <strong className="text-foreground">链接仅显示一次。</strong>关闭抽屉后无法再次查看，请现在复制并安全分享。
                                        </p>
                                        <Input value={generatedLink} readOnly aria-label="新创建的邀请链接" onFocus={(event) => event.currentTarget.select()} />
                                        <Button block icon={copied ? <Check className="size-4" /> : <Clipboard className="size-4" />} onClick={() => void copyLink()}>
                                            {copied ? "已复制" : "一键复制"}
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        ),
                    },
                    {
                        key: "records",
                        label: `邀请记录${total ? ` (${total})` : ""}`,
                        children: (
                            <div className="space-y-4 p-4 sm:p-6">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Select
                                        aria-label="筛选邀请状态"
                                        className="min-w-32"
                                        value={status}
                                        options={[{ value: "all", label: "全部状态" }, ...Object.entries(statusCopy).map(([value, item]) => ({ value, label: item.label }))]}
                                        onChange={(value) => {
                                            setStatus(value);
                                            setPage(1);
                                        }}
                                    />
                                    <Button icon={<RefreshCw className="size-4" />} onClick={() => void loadInvites()} loading={loading}>
                                        刷新
                                    </Button>
                                </div>
                                <Spin spinning={loading}>
                                    {invites.length ? (
                                        <div className="space-y-3">
                                            {invites.map((invite) => {
                                                const copy = statusCopy[invite.status];
                                                return (
                                                    <article key={invite.id} className="rounded-xl border border-border p-4">
                                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <Tag color={copy.color}>{copy.label}</Tag>
                                                                    <span className="truncate text-xs text-muted-foreground">{invite.id}</span>
                                                                </div>
                                                                <p className="mb-0 mt-2 break-words text-sm">{invite.note || "无备注"}</p>
                                                            </div>
                                                            {invite.status === "pending" ? (
                                                                <Popconfirm title="撤销这条邀请？" description="撤销后该链接立即失效。" okText="撤销" cancelText="取消" onConfirm={() => void revoke(invite)}>
                                                                    <Button danger size="small" icon={<RotateCcw className="size-3.5" />}>
                                                                        撤销
                                                                    </Button>
                                                                </Popconfirm>
                                                            ) : null}
                                                        </div>
                                                        <dl className="mb-0 mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                                            <div>
                                                                <dt className="inline">创建：</dt>
                                                                <dd className="inline">{formatDate(invite.createdAt)}</dd>
                                                            </div>
                                                            <div>
                                                                <dt className="inline">过期：</dt>
                                                                <dd className="inline">{formatDate(invite.expiresAt)}</dd>
                                                            </div>
                                                            {invite.usedBy ? (
                                                                <div className="sm:col-span-2">
                                                                    <dt className="inline">使用用户：</dt>
                                                                    <dd className="inline text-foreground">
                                                                        {invite.usedBy.displayName || invite.usedBy.username} (@{invite.usedBy.username})
                                                                    </dd>
                                                                </div>
                                                            ) : null}
                                                        </dl>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "正在读取" : "暂无邀请记录"} />
                                    )}
                                </Spin>
                                {total > pageSize ? <Pagination responsive current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={setPage} /> : null}
                            </div>
                        ),
                    },
                ]}
            />
        </Drawer>
    );
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
