import { Alert, App, Button, Input, InputNumber, Skeleton, Switch } from "antd";
import { useEffect, useState } from "react";
import { Link, useBlocker } from "react-router";
import { AdminPageFrame } from "../components/admin-shell";
import { getTurnstileSetting, saveTurnstileSetting, type TurnstileSetting } from "@/services/api/turnstile";
import "./turnstile-settings.css";

const scenes = [
    { key: "registration", title: "注册", detail: "发送注册验证码前验证，保护邮件与短信额度。" },
    { key: "passwordReset", title: "找回密码", detail: "发送密码重置邮件前验证。" },
    { key: "codeLogin", title: "验证码登录", detail: "发送登录验证码前验证，邮箱与短信共用此策略。" },
    { key: "passwordLogin", title: "密码登录", detail: "连续失败达到阈值后验证，正常登录保持简洁。" },
] as const;

export default function TurnstileSettingsPage() {
    const { message, modal } = App.useApp();
    const [saved, setSaved] = useState<TurnstileSetting | null>(null);
    const [draft, setDraft] = useState<TurnstileSetting | null>(null);
    const [secret, setSecret] = useState("");
    const [hosts, setHosts] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const dirty = Boolean(draft && saved && (secret || JSON.stringify(draft) !== JSON.stringify(saved) || hosts !== saved.hostnames.join("\n")));
    const blocker = useBlocker(dirty || saving);
    const apply = (value: TurnstileSetting) => { setSaved(value); setDraft(value); setHosts(value.hostnames.join("\n")); setSecret(""); };
    const load = async () => {
        setLoading(true); setError("");
        try { apply((await getTurnstileSetting()).setting); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "读取失败，请重试"); }
        finally { setLoading(false); }
    };
    useEffect(() => { void load(); }, []);
    useEffect(() => {
        if (!dirty) return;
        const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", prevent);
        return () => window.removeEventListener("beforeunload", prevent);
    }, [dirty]);
    const save = async () => {
        if (!draft || saving) return;
        setSaving(true); setError("");
        try {
            const { hasSecretKey: _hasSecretKey, ...input } = draft;
            apply((await saveTurnstileSetting({ ...input, secretKey: secret, hostnames: hosts.split(/[\s,，]+/).filter(Boolean) })).setting);
            message.success("人机验证设置已保存");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试"); }
        finally { setSaving(false); }
    };
    const reload = () => dirty ? modal.confirm({ title: "放弃调整并重新读取？", content: "未保存的人机验证设置将被丢弃。", okText: "放弃并刷新", cancelText: "继续编辑", onOk: load }) : void load();
    const edit = <K extends keyof TurnstileSetting>(key: K, value: TurnstileSetting[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);

    return <AdminPageFrame title="人机验证" description="使用 Cloudflare Turnstile，按场景保护登录与验证码发送" scroll actions={<Link className="ant-btn ant-btn-default" to="/admin/settings/access">登录与注册</Link>}>
        <div className="admin-turnstile" data-ui>
            {blocker.state === "blocked" && <Alert type="warning" title="设置尚未保存" description="离开会丢弃当前调整。" action={<div className="turnstile-actions"><Button onClick={() => blocker.reset()}>继续编辑</Button><Button danger disabled={saving} onClick={() => blocker.proceed()}>放弃并离开</Button></div>} />}
            <div className="turnstile-toolbar"><span role="status">{dirty ? "有未保存的调整" : saved?.enabled ? "人机验证已启用" : "人机验证未启用"}</span><div className="turnstile-actions"><Button disabled={loading || saving} onClick={reload}>重新读取</Button><Button type="primary" disabled={!dirty || loading} loading={saving} onClick={() => void save()}>保存设置</Button></div></div>
            {error && <Alert type="error" title="设置未确认保存" description={error} action={saved ? undefined : <Button onClick={() => void load()}>重试</Button>} />}
            {loading ? <Skeleton active paragraph={{ rows: 12 }} /> : draft && <div className="turnstile-settings-grid">
                <section className="turnstile-settings-section" aria-labelledby="turnstile-connection">
                    <div className="turnstile-section-heading"><div><h2 id="turnstile-connection">连接 Cloudflare</h2><p>在 Cloudflare 中创建 Managed 类型的 Turnstile 小组件。</p></div><Switch aria-label="启用人机验证" checked={draft.enabled} disabled={saving} onChange={(value) => edit("enabled", value)} /></div>
                    <label className="turnstile-setting-field"><span>Site Key</span><Input value={draft.siteKey} disabled={saving} onChange={(event) => edit("siteKey", event.target.value)} placeholder="填写小组件的 Site Key" autoComplete="off" spellCheck={false} /></label>
                    <label className="turnstile-setting-field"><span>Secret Key <small>{draft.hasSecretKey ? "已配置 · 留空保留" : "尚未配置"}</small></span><Input.Password value={secret} disabled={saving} onChange={(event) => setSecret(event.target.value)} placeholder={draft.hasSecretKey ? "需要更换时填写新的密钥" : "填写小组件的 Secret Key"} autoComplete="new-password" /></label>
                    <label className="turnstile-setting-field"><span>允许域名</span><Input.TextArea value={hosts} disabled={saving} onChange={(event) => setHosts(event.target.value)} rows={4} placeholder={"mengceng.com\nwww.mengceng.com"} autoComplete="off" spellCheck={false} /><small>每行一个，与 Cloudflare 中配置的实际访问域名一致，不含 https:// 或路径。本机调试可单独添加 localhost。</small></label>
                    <a className="turnstile-console-link" href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noreferrer">打开 Cloudflare Turnstile ↗</a>
                </section>
                <section className="turnstile-settings-section" aria-labelledby="turnstile-policy"><h2 id="turnstile-policy">验证场景</h2><p className="turnstile-section-note">验证在用户提交时启动，需要交互时显示在当前表单内。</p>
                    {scenes.map((scene) => <div className="turnstile-policy-row" key={scene.key}><div><label htmlFor={`turnstile-${scene.key}`}>{scene.title}</label><p>{scene.detail}</p></div><Switch id={`turnstile-${scene.key}`} checked={draft[scene.key]} disabled={saving} onChange={(value) => edit(scene.key, value)} /></div>)}
                    <div className="turnstile-threshold"><label htmlFor="turnstile-threshold">密码登录失败触发次数</label><InputNumber id="turnstile-threshold" min={1} max={10} precision={0} value={draft.loginFailureThreshold} disabled={saving || !draft.passwordLogin} onChange={(value) => edit("loginFailureThreshold", value ?? 3)} /><p>10 分钟内，同一来源与账号达到此次数后，下次登录需要验证。同一来源大量尝试不同账号也会触发。</p></div>
                </section>
            </div>}
        </div>
    </AdminPageFrame>;
}
