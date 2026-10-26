import { Alert, App, Button, Input, Segmented, Skeleton } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "react-router";

import { AdminPageFrame } from "../components/admin-shell";
import {
    emailTemplateScenes, getEmailTemplates, previewEmailTemplate, saveEmailTemplates,
    type EmailTemplate, type EmailTemplatePreview, type EmailTemplateScene, type EmailTemplates,
} from "@/services/api/email-templates";
import "./email-templates-settings.css";

const fields = [
    { key: "subject", label: "邮件主题", max: 120, rows: 1 },
    { key: "title", label: "正文标题", max: 80, rows: 1 },
    { key: "intro", label: "验证说明", max: 600, rows: 4 },
    { key: "footer", label: "邮件页脚", max: 400, rows: 3 },
] as const;

export default function EmailTemplatesSettingsPage() {
    const { message, modal } = App.useApp();
    const [setting, setSetting] = useState<EmailTemplates | null>(null);
    const [draft, setDraft] = useState<EmailTemplates["templates"] | null>(null);
    const [scene, setScene] = useState<EmailTemplateScene>("register");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [preview, setPreview] = useState<EmailTemplatePreview | null>(null);
    const [previewError, setPreviewError] = useState("");
    const [previewing, setPreviewing] = useState(false);
    const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
    const [format, setFormat] = useState<"html" | "text">("html");
    const mounted = useRef(true);
    const loadVersion = useRef(0);
    const dirty = Boolean(setting && draft && JSON.stringify(setting.templates) !== JSON.stringify(draft));
    const blocker = useBlocker(dirty || saving);
    const active = draft?.[scene];

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; loadVersion.current++; }; }, []);
    useEffect(() => {
        if (!dirty) return;
        const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", prevent);
        return () => window.removeEventListener("beforeunload", prevent);
    }, [dirty]);

    const load = useCallback(async () => {
        const version = ++loadVersion.current;
        setLoading(true);
        setLoadError("");
        try {
            const { setting: value } = await getEmailTemplates();
            if (!mounted.current || version !== loadVersion.current) return;
            setSetting(value); setDraft(value.templates); setSaveError("");
        } catch (error) {
            if (mounted.current && version === loadVersion.current) setLoadError(error instanceof Error ? error.message : "读取邮件模板失败");
        } finally {
            if (mounted.current && version === loadVersion.current) setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (!active) return;
        let cancelled = false;
        setPreviewing(true); setPreviewError(""); setPreview(null);
        const timer = window.setTimeout(() => {
            void previewEmailTemplate(scene, active).then(({ preview: value }) => {
                if (!cancelled) setPreview(value);
            }).catch((error: unknown) => {
                if (!cancelled) setPreviewError(error instanceof Error ? error.message : "预览暂不可用");
            }).finally(() => { if (!cancelled) setPreviewing(false); });
        }, 350);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [active, scene]);

    const refresh = () => {
        if (!dirty) { void load(); return; }
        modal.confirm({ title: "放弃调整并重新读取？", content: "未保存的邮件文案将被丢弃。", okText: "放弃并刷新", cancelText: "继续编辑", onOk: load });
    };
    const save = async () => {
        if (!setting || !draft) return;
        setSaving(true); setSaveError("");
        try {
            const { setting: value } = await saveEmailTemplates({ revision: setting.revision, templates: draft });
            if (!mounted.current) return;
            setSetting(value); setDraft(value.templates);
            message.success("邮件模板已保存，后续验证码邮件将使用新文案");
        } catch (error) {
            if (mounted.current) setSaveError(error instanceof Error ? error.message : "保存失败，请重新读取后核对");
        } finally { if (mounted.current) setSaving(false); }
    };
    const edit = (key: keyof EmailTemplate, value: string) => setDraft((current) => current ? { ...current, [scene]: { ...current[scene], [key]: value } } : current);
    return <AdminPageFrame title="邮件模板" description="编辑账户验证码文案，预览用户收到的邮件" scroll actions={<Link className="ant-btn ant-btn-default" to="/admin/settings/email">邮件服务设置</Link>}>
        <div className="admin-email-templates" data-ui>
            {blocker.state === "blocked" && <Alert type="warning" title="邮件模板尚未保存" description="离开会丢弃当前调整。" action={<div className="email-template-actions"><Button onClick={() => blocker.reset()}>继续编辑</Button><Button danger disabled={saving} onClick={() => blocker.proceed()}>放弃并离开</Button></div>} />}
            <div className="email-template-toolbar">
                <p role="status">{dirty ? "有未保存的调整" : setting?.updatedAt ? "已保存的模板" : "正在使用品牌默认模板"}<span>验证码与有效期由系统生成</span></p>
                <div className="email-template-actions"><Button onClick={refresh} disabled={loading || saving}>重新读取</Button><Button type="primary" onClick={() => void save()} loading={saving} disabled={!dirty || loading}>保存模板</Button></div>
            </div>
            {loadError && <Alert type="error" title="无法读取模板" description={loadError} action={<Button onClick={() => void load()}>重试</Button>} />}
            {saveError && <Alert type="error" title="模板未确认保存" description={saveError} />}
            {loading ? <Skeleton active paragraph={{ rows: 10 }} /> : setting && draft && active ? <>
                <nav className="email-template-scenes" aria-label="邮件使用场景">{emailTemplateScenes.map((item) => <button key={item.value} type="button" aria-pressed={scene === item.value} disabled={saving} onClick={() => setScene(item.value)}>{item.label}</button>)}</nav>
                <div className="email-template-layout">
                    <section className="email-template-editor" aria-label="模板文案">
                        <div className="email-template-section-heading"><h2>模板文案</h2><Button type="text" disabled={saving} onClick={() => setDraft({ ...draft, [scene]: { ...setting.defaults[scene] } })}>恢复此场景默认</Button></div>
                        <p className="email-template-hint">使用 <code>{"{{brand}}"}</code> 自动填入品牌名称。验证码、有效期与安全提醒会统一保留。</p>
                        {fields.map((field) => <div className="email-template-field" key={field.key}>
                            <label htmlFor={`email-template-${field.key}`}>{field.label}<span aria-hidden="true">{active[field.key].length} / {field.max}</span></label>
                            {field.rows === 1 ? <Input id={`email-template-${field.key}`} value={active[field.key]} maxLength={field.max} disabled={saving} onChange={(event) => edit(field.key, event.target.value)} /> : <Input.TextArea id={`email-template-${field.key}`} value={active[field.key]} maxLength={field.max} rows={field.rows} disabled={saving} onChange={(event) => edit(field.key, event.target.value)} />}
                        </div>)}
                    </section>
                    <section className="email-template-preview" aria-label="邮件预览" aria-busy={previewing}>
                        <div className="email-template-section-heading"><h2>收件效果</h2><Segmented aria-label="邮件格式" options={[{ label: "图文", value: "html" }, { label: "纯文本", value: "text" }]} value={format} onChange={setFormat} /></div>
                        <div className="email-template-preview-toolbar"><span>示例验证码 123456 · 预览不会发送邮件</span><Segmented aria-label="预览尺寸" options={[{ label: "桌面", value: "desktop" }, { label: "手机", value: "mobile" }]} value={width} onChange={setWidth} /></div>
                        {previewError ? <Alert type="error" title="请先修正文案" description={previewError} /> : previewing || !preview ? <Skeleton active paragraph={{ rows: 8 }} /> : <>
                            <p className="email-template-subject"><span>主题</span>{preview.subject}</p>
                            <div className={`email-template-preview-stage is-${width}`}>
                                {format === "html" ? <iframe title="验证码邮件预览" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} /> : <pre>{preview.text}</pre>}
                            </div>
                        </>}
                    </section>
                </div>
            </> : null}
        </div>
    </AdminPageFrame>;
}
