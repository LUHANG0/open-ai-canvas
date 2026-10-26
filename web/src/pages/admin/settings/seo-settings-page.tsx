import { Alert, App, Button, Checkbox, Input, Skeleton, Table, Tag } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { AdminPageFrame } from "../components/admin-shell";
import { checkSEO, getSEOSetting, saveSEOSetting, type SEOJob, type SEOSetting, type SEOSettingInput } from "@/services/api/seo";

const statuses: Record<string, string> = { pending: "待提交", sending: "提交中", accepted: "平台已接受", retry: "等待重试", blocked: "需要处理", quota: "等待配额恢复" };
const reasons: Record<string, string> = { tls_certificate_invalid: "接口 HTTPS 证书校验失败，请检查百度连接方式", credentials_required: "请配置百度推送密钥", credentials_rejected: "推送密钥被平台拒绝", verification_key_required: "请保存配置以创建验证文件", accepted_pending_verification: "平台已接受，验证处理中", quota_exhausted: "当日配额已用尽", rate_limited: "平台限流，稍后重试", network_error: "连接失败，按退避时间重试", provider_unavailable: "平台暂不可用", verification_or_request_rejected: "请检查公开验证文件和站点归属", invalid_provider_response: "平台响应格式不符" };
const timeText = (value?: string) => value && !value.startsWith("0001-") ? new Date(value).toLocaleString("zh-CN") : "—";
const toDraft = (v: SEOSetting): SEOSettingInput => ({ revision: v.revision, enabled: v.enabled, baiduEnabled: v.baiduEnabled, baiduAllowHTTP: v.baiduAllowHTTP ?? false, indexNowEnabled: v.indexNowEnabled, googleSitemapRegistered: v.googleSitemapRegistered, baiduToken: "", clearBaiduToken: false });

export default function SEOSettingsPage() {
    const { message, modal } = App.useApp();
    const [setting, setSetting] = useState<SEOSetting | null>(null);
    const [draft, setDraft] = useState<SEOSettingInput | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState("");
    const version = useRef(0);
    const dirty = Boolean(setting && draft && JSON.stringify(toDraft(setting)) !== JSON.stringify(draft));
    const blocker = useBlocker(dirty || saving);
    const confirming = useRef(false);
    const load = useCallback(async (signal?: AbortSignal) => {
        const id = ++version.current;
        setLoading(true); setError("");
        try {
            const { setting: value } = await getSEOSetting(signal);
            if (id !== version.current || signal?.aborted) return;
            setSetting(value); setDraft(toDraft(value));
        } catch (e) { if (id === version.current && !signal?.aborted) setError(e instanceof Error ? e.message : "读取收录状态失败"); }
        finally { if (id === version.current) setLoading(false); }
    }, []);
    useEffect(() => { const c = new AbortController(); void load(c.signal); return () => { c.abort(); version.current++; }; }, [load]);
    useEffect(() => {
        if (!dirty) return;
        const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
    }, [dirty]);
    useEffect(() => {
        if (blocker.state !== "blocked" || confirming.current) return;
        confirming.current = true;
        modal.confirm({ title: "收录配置有未保存的修改", content: "离开会放弃本页草稿。", okText: "放弃并离开", cancelText: "继续编辑", onOk: () => { confirming.current = false; blocker.proceed(); }, onCancel: () => { confirming.current = false; blocker.reset(); } });
    }, [blocker, modal]);
    const save = async () => {
        if (!draft) return;
        setSaving(true); setError("");
        try { const { setting: value } = await saveSEOSetting(draft); setSetting(value); setDraft(toDraft(value)); message.success("配置已保存，后台会检查新增和更新的公开页面"); }
        catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
        finally { setSaving(false); }
    };
    const check = async () => { setChecking(true); try { await checkSEO(); message.success("已安排检查，稍后刷新查看平台响应"); } catch (e) { setError(e instanceof Error ? e.message : "无法安排检查"); } finally { setChecking(false); } };
    const change = (patch: Partial<SEOSettingInput>) => setDraft((v) => v ? { ...v, ...patch } : v);
    const jobs = setting?.jobs || [];
    const accepted = jobs.filter((j) => j.status === "accepted").length;
    return <AdminPageFrame title="公开页面与收录" description="查看公开内容、自动更新的 sitemap，以及搜索平台的提交反馈" scroll actions={<><Button onClick={() => void load()} disabled={dirty || saving || loading}>刷新状态</Button><Button onClick={() => void check()} loading={checking} disabled={dirty || !setting?.enabled}>检查新页面</Button><Button type="primary" onClick={() => void save()} loading={saving} disabled={!dirty || loading}>保存配置</Button></>}>
        {error && <Alert type="error" showIcon title={error} className="mb-6" />}
        {loading && !setting ? <Skeleton active paragraph={{ rows: 8 }} /> : setting && draft ? <div className="space-y-6">
            <section className="rounded-lg bg-card p-6" aria-labelledby="seo-summary"><h2 id="seo-summary" className="text-lg font-semibold">{setting.enabled ? "自动提交已启用" : "自动提交尚未启用"}</h2><p className="mt-2">已发布 {setting.pages?.length || 0} 个公开页面，当前版本有 {accepted} 条提交被平台接受。接受提交与实际收录是不同状态。</p><p className="mt-2">站点地址：{setting.origin || "尚未配置 CANVAS_PUBLIC_BASE_URL"}</p><div className="mt-4 flex flex-wrap gap-4"><a href="/features" target="_blank" rel="noreferrer">查看功能页</a><a href="/tutorials" target="_blank" rel="noreferrer">查看教程</a><a href="/sitemap.xml" target="_blank" rel="noreferrer">查看动态 sitemap</a></div></section>
            <section className="rounded-lg bg-card p-6" aria-labelledby="seo-config"><h2 id="seo-config" className="text-lg font-semibold">提交方式</h2><div className="mt-4 space-y-4">
                <div><Checkbox checked={draft.enabled} disabled={saving} onChange={(e) => change({ enabled: e.target.checked })}>自动检查新页面和内容更新</Checkbox><p className="mt-2">每分钟检查已发布的公开页面；按内容版本去重。失败会退避重试，平台配额耗尽后等待恢复，不会反复推送已接受的相同版本。</p></div>
                <div><Checkbox checked={draft.indexNowEnabled} disabled={saving} onChange={(e) => change({ indexNowEnabled: e.target.checked })}>通过 IndexNow 通知支持该协议的搜索引擎</Checkbox><p className="mt-2">保存启用后自动创建本站验证文件。它不代表 Google 或百度已经收录。</p></div>
                <div><Checkbox checked={draft.baiduEnabled} disabled={saving} onChange={(e) => change({ baiduEnabled: e.target.checked })}>通过百度普通收录 API 推送新链接</Checkbox><div className="mt-3"><Checkbox checked={draft.baiduAllowHTTP} disabled={saving} onChange={(e) => change({ baiduAllowHTTP: e.target.checked })}>使用百度官方 HTTP 接口（密钥将以明文传输）</Checkbox><p className="mt-2">默认使用 HTTPS 并校验证书。百度站长平台提供的是 HTTP 接口；只有明确接受密钥在传输途中被读取的风险时才启用此选项。</p>{draft.baiduAllowHTTP && <Alert type="warning" showIcon title="将通过未加密的 HTTP 向百度官方 data.zz.baidu.com 发送推送密钥和本站公开网址。此选项只影响百度提交接口。" />}</div><label className="mt-4 block" htmlFor="baidu-push-token">百度推送密钥</label><Input.Password id="baidu-push-token" name="baidu-push-token" autoComplete="off" className="mt-2 max-w-xl" maxLength={256} value={draft.baiduToken} disabled={saving || draft.clearBaiduToken} placeholder={setting.hasBaiduToken ? "已配置；留空保持现有密钥" : "从百度搜索资源平台的 API 提交页获取"} onChange={(e) => change({ baiduToken: e.target.value })} /><p className="mt-2">密钥在服务端加密保存，读取接口和提交日志不返回密钥。</p><Checkbox checked={draft.clearBaiduToken} disabled={saving} onChange={(e) => change({ clearBaiduToken: e.target.checked, baiduToken: "" })}>清除已保存的百度密钥</Checkbox></div>
                <div><h3 className="text-base font-semibold">Google 自动发现</h3><p className="mt-2">新增和更新的页面会自动进入同一份 sitemap。Google 按自己的计划读取已登记的 sitemap；普通教程和功能页不使用专用于招聘或直播的 Indexing API。</p><Checkbox checked={draft.googleSitemapRegistered} disabled={saving} onChange={(e) => change({ googleSitemapRegistered: e.target.checked })}>已在 Google Search Console 登记本站 sitemap</Checkbox></div>
            </div></section>
            <section className="rounded-lg bg-card p-6" aria-labelledby="seo-jobs"><h2 id="seo-jobs" className="mb-4 text-lg font-semibold">当前内容版本的提交记录</h2><Table<SEOJob> rowKey="id" dataSource={jobs} scroll={{ x: 980 }} size="small" pagination={{ pageSize: 12 }} locale={{ emptyText: "保存并启用后，系统会为已发布页面创建提交记录。" }} columns={[
                { title: "平台", dataIndex: "provider", width: 110, render: (v: string) => v === "baidu" ? "百度" : "IndexNow" },
                { title: "公开页面", dataIndex: "url", width: 260, render: (v: string) => <a href={v} target="_blank" rel="noreferrer">{new URL(v).pathname}</a> },
                { title: "状态", dataIndex: "status", width: 140, render: (v: string) => <Tag color={v === "accepted" ? "success" : v === "blocked" ? "error" : undefined}>{statuses[v] || v}</Tag> },
                { title: "次数", dataIndex: "attempts", width: 70 },
                { title: "平台反馈", dataIndex: "lastCode", width: 240, render: (v?: string) => v === "accepted" ? "平台已接受" : v ? reasons[v] || "平台暂未接受，等待检查" : "—" },
                { title: "下次尝试", width: 190, render: (_: unknown, row: SEOJob) => row.status === "accepted" || row.status === "blocked" ? "—" : timeText(row.nextAttemptAt) },
                { title: "已接受时间", dataIndex: "acceptedAt", width: 190, render: timeText },
            ]} /></section>
        </div> : <p>暂时无法读取配置，请刷新重试。</p>}
    </AdminPageFrame>;
}
