import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Input, InputNumber, Radio, Table, Tag } from "antd";
import { AdminDrawer } from "@/pages/admin/ui/overlays";
import { PaginationBar } from "@/pages/admin/components/admin-ui";
import { getAdminCreditPolicy } from "@/services/api/wallet";
import { createRegistrationInvitation, invitationPath, invitationStateLabels, listRegistrationInvitations, revokeRegistrationInvitation, type RegistrationInvitation } from "@/services/api/registration-invitations";
import { formatCredits } from "@/constant/credits";
import { invitationCreditsText, parseInvitationCredits } from "@/lib/invitation-credits";

const presets = [50, 100, 200];
const date = (value: string) => new Date(value).toLocaleString("zh-CN");

export function InvitationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message, modal } = App.useApp();
    const [note, setNote] = useState("");
    const [selection, setSelection] = useState<number | "custom">(100);
    const [custom, setCustom] = useState<string | null>(null);
    const [days, setDays] = useState<number | null>(7);
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [policyError, setPolicyError] = useState("");
    const [operationError, setOperationError] = useState("");
    const [items, setItems] = useState<RegistrationInvitation[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [retry, setRetry] = useState(0);
    const [policyRetry, setPolicyRetry] = useState(0);
    const [latest, setLatest] = useState<RegistrationInvitation | null>(null);
    const busy = useRef(false);
    const amount = selection === "custom" ? parseInvitationCredits(custom) : selection * 1_000_000;
    const link = (code: string) => new URL(invitationPath(code), window.location.origin).href;

    useEffect(() => {
        if (!open) return;
        let active = true;
        setReady(false); setPolicyError(""); setLatest(null); setOperationError("");
        void getAdminCreditPolicy().then(({ policy }) => {
            if (!active) return;
            const whole = policy.signupBonusMicrocredits / 1_000_000;
            setSelection(presets.includes(whole) ? whole : "custom");
            setCustom(invitationCreditsText(policy.signupBonusMicrocredits));
            setNote(""); setDays(7); setReady(true);
        }).catch((error) => { if (active) setPolicyError(error instanceof Error ? error.message : "读取注册赠送设置失败"); });
        return () => { active = false; };
    }, [open, policyRetry]);

    const load = useCallback(async () => {
        const result = await listRegistrationInvitations(page);
        setItems(result.invitations); setTotal(result.total);
    }, [page]);
    useEffect(() => {
        if (!open) return;
        let active = true; setLoading(true); setError("");
        void listRegistrationInvitations(page).then((result) => {
            if (active) { setItems(result.invitations); setTotal(result.total); }
        }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "读取邀请记录失败"); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [open, page, retry]);

    const copy = async (item: RegistrationInvitation) => {
        try { await navigator.clipboard.writeText(link(item.code)); message.success("邀请链接已复制"); }
        catch { setLatest(item); setOperationError("无法自动复制，请从邀请链接输入框手动复制。"); }
    };
    const create = async () => {
        if (busy.current || !ready || amount === null || days === null || days < 1 || days > 90 || !Number.isInteger(days)) return;
        busy.current = true; setSaving(true); setOperationError("");
        try {
            const result = await createRegistrationInvitation({ note, bonusMicrocredits: amount, expiresInDays: days });
            setLatest(result.invitation); setNote(""); message.success("邀请已生成");
            try { await load(); } catch { setError("邀请已生成，记录暂未刷新，请重试读取。"); }
        } catch (error) { setOperationError(error instanceof Error ? error.message : "生成邀请失败"); }
        finally { busy.current = false; setSaving(false); }
    };
    const revoke = (item: RegistrationInvitation) => modal.confirm({
        title: "撤销这条邀请？", content: "撤销后该邀请不能再用于注册。", okText: "撤销邀请", cancelText: "取消", okButtonProps: { danger: true },
        onOk: async () => {
            try { await revokeRegistrationInvitation(item.id); if (latest?.id === item.id) setLatest(null); await load(); message.success("邀请已撤销"); }
            catch (error) { setOperationError(error instanceof Error ? error.message : "撤销邀请失败"); throw error; }
        },
    });

    return <AdminDrawer title="邀请用户" open={open} onClose={() => { if (!saving) onClose(); }} size="min(960px, 100vw)" mask={{ closable: !saving }}>
        <div className="space-y-6">
            <form className="space-y-4" aria-busy={saving || (!ready && !policyError)} onSubmit={(event) => { event.preventDefault(); void create(); }}>
                <label className="block space-y-2"><span>备注（仅管理员可见）</span><Input value={note} maxLength={200} disabled={saving} onChange={(event) => setNote(event.target.value)} placeholder="用于辨认这条邀请" /></label>
                <fieldset className="space-y-2" disabled={saving || !ready}>
                    <legend className="mb-2 text-sm">注册赠送积分</legend>
                    <Radio.Group aria-label="注册赠送积分" value={selection} onChange={(event) => setSelection(event.target.value)} options={[...presets.map((value) => ({ value, label: `${value} 积分` })), { value: "custom", label: "自定义" }]} />
                    {selection === "custom" && <div><InputNumber<string> stringMode aria-label="自定义注册赠送积分" aria-describedby="invitation-credit-help" aria-invalid={amount === null} value={custom} min="0" max="1000000" precision={6} disabled={saving || !ready} onChange={setCustom} placeholder="可填 0" /></div>}
                    <p id="invitation-credit-help" className="m-0 text-xs text-muted-foreground">替代全局注册赠送，不叠加；填 0 不赠送。自定义须为 0–1,000,000，最多 6 位小数，生成后金额固定。</p>
                </fieldset>
                <label className="flex items-center gap-3"><span>有效期（天）</span><InputNumber aria-label="邀请有效期（天）" value={days} min={1} max={90} precision={0} onChange={setDays} disabled={saving} /></label>
                {!ready && !policyError && <p role="status" className="text-sm text-muted-foreground">正在读取注册赠送设置…</p>}
                {policyError && <div role="alert">{policyError} <Button size="small" onClick={() => setPolicyRetry((n) => n + 1)}>重新读取</Button></div>}
                {operationError && <p role="alert" className="text-destructive">{operationError}</p>}
                <Button type="primary" htmlType="submit" loading={saving} disabled={!ready || amount === null || days === null || days < 1 || days > 90 || !Number.isInteger(days)}>生成邀请链接</Button>
                {latest && <label className="block space-y-2"><span>邀请链接</span><div className="flex gap-2"><Input readOnly value={link(latest.code)} onFocus={(event) => event.target.select()} /><Button onClick={() => void copy(latest)}>复制链接</Button></div></label>}
            </form>
            <section aria-label="邀请记录" className="space-y-3">
                <div className="flex items-center justify-between"><h2 className="m-0 text-base font-medium">邀请记录</h2><Button size="small" onClick={() => setRetry((n) => n + 1)}>刷新记录</Button></div>
                {error && <div role="alert">{error}</div>}
                <Table<RegistrationInvitation> size="small" rowKey="id" loading={loading} dataSource={items} pagination={false} scroll={{ x: 780 }} locale={{ emptyText: error ? "邀请记录暂不可用" : "暂无邀请" }} columns={[
                    { title: "备注", dataIndex: "note", width: 160, render: (value: string) => value || "—" },
                    { title: "积分", dataIndex: "bonusMicrocredits", render: (value: number) => <span className="tabular-nums">{formatCredits(value)}</span> },
                    { title: "状态", dataIndex: "state", render: (state: RegistrationInvitation["state"]) => <Tag>{invitationStateLabels[state]}</Tag> },
                    { title: "创建 / 到期", render: (_, item) => <div className="text-xs leading-5"><div>{date(item.createdAt)}</div><div className="text-muted-foreground">{date(item.expiresAt)}</div></div> },
                    { title: "受邀账号", render: (_, item) => item.usedByUsername ? <span>@{item.usedByUsername}</span> : "—" },
                    { title: "操作", fixed: "right", width: 160, render: (_, item) => item.state === "valid" ? <div className="flex gap-1"><Button size="small" type="text" onClick={() => void copy(item)} aria-label={`复制邀请链接${item.note ? `：${item.note}` : ""}`}>复制</Button><Button size="small" type="text" danger onClick={() => revoke(item)}>撤销</Button></div> : null },
                ]} />
                <PaginationBar alwaysShow current={page} pageSize={20} total={total} onChange={(next) => setPage(next)} />
            </section>
        </div>
    </AdminDrawer>;
}
