import { App, Button, Input, Skeleton } from "antd";
import { AlertTriangle, ExternalLink, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { getAdminPublicSite, updateAdminSiteDisplay, type AdminPublicSiteSetting, type SiteDisplaySettings } from "@/services/api/public-site";

function publishedDisplay(setting: AdminPublicSiteSetting): SiteDisplaySettings {
    return { posterUrl: setting.published.hero.posterUrl, contactUrl: setting.published.links.contactUrl, icpText: setting.published.links.icpText, icpUrl: setting.published.links.icpUrl || "https://beian.miit.gov.cn/" };
}

export function SiteDisplaySettingsEditor({ onDirtyChange, onBusyChange, onErrorChange }: { onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; onErrorChange: (error: boolean) => void }) {
    const { message, modal } = App.useApp();
    const { replace } = usePublicSite();
    const [setting, setSetting] = useState<AdminPublicSiteSetting | null>(null);
    const [draft, setDraft] = useState<SiteDisplaySettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const version = useRef(0);
    const dirty = Boolean(setting && draft && JSON.stringify(publishedDisplay(setting)) !== JSON.stringify(draft));
    const busy = loading || saving;

    const load = useCallback(async () => {
        const current = ++version.current;
        setLoading(true);
        setError("");
        try {
            const { setting: next } = await getAdminPublicSite();
            if (current !== version.current) return;
            setSetting(next);
            setDraft(publishedDisplay(next));
        } catch (cause) {
            if (current === version.current) setError(cause instanceof Error ? cause.message : "读取网站设置失败");
        } finally {
            if (current === version.current) setLoading(false);
        }
    }, []);
    useEffect(() => {
        void load();
        return () => {
            version.current++;
        };
    }, [load]);
    useEffect(() => {
        onDirtyChange(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
        onBusyChange(busy);
    }, [busy, onBusyChange]);
    useEffect(() => {
        onErrorChange(Boolean(error));
    }, [error, onErrorChange]);

    const save = async () => {
        if (!setting || !draft || !dirty || busy) return;
        setSaving(true);
        setError("");
        try {
            const { setting: next } = await updateAdminSiteDisplay(setting.revision, draft);
            setSetting(next);
            setDraft(publishedDisplay(next));
            replace({ revision: next.publishedRevision, config: next.published });
            message.success("网站封面、联系与备案设置已生效");
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : "保存网站设置失败";
            setError(`${detail}。输入已保留，可修改后重试；如配置已被他人更新，请重新读取。`);
        } finally {
            setSaving(false);
        }
    };
    const update = (key: keyof SiteDisplaySettings, value: string) => {
        setDraft((current) => (current ? { ...current, [key]: value } : current));
        setError("");
    };

    return (
        <>
            <div className="admin-branding-editor-head">
                <div>
                    <strong>官网与备案</strong>
                    <p>封面、联系与备案保存后直接生效，官网其他内容保持原有发布版本。</p>
                </div>
                <Button href="/" target="_blank" rel="noreferrer" icon={<ExternalLink className="size-4" />}>
                    查看官网
                </Button>
            </div>
            {error ? (
                <div className="admin-branding-inline-error" role="alert">
                    <AlertTriangle className="size-4" />
                    <span>{error}</span>
                </div>
            ) : null}
            <fieldset className="admin-branding-editor-sheet" disabled={busy}>
                <div className="admin-branding-panel-content">
                    {draft ? (
                        <>
                            <div className="admin-branding-group-heading">
                                <strong>共用封面</strong>
                                <p>官网首页与整页登录共用一张品牌海报。</p>
                            </div>
                            <label className="admin-branding-field">
                                <span>官网与登录页封面</span>
                                <Input value={draft.posterUrl} maxLength={2048} placeholder="图片地址，留空使用内置品牌海报" onChange={(e) => update("posterUrl", e.target.value)} />
                            </label>
                            <div className="admin-branding-subsection">
                                <div>
                                    <strong>联系与备案</strong>
                                    <p>联系入口显示在官网；备案显示在官网与登录页页脚。留空可隐藏对应内容。</p>
                                </div>
                                <label className="admin-branding-field">
                                    <span>联系地址</span>
                                    <Input value={draft.contactUrl} maxLength={2048} placeholder="联系页面的 HTTPS 地址，留空不展示" onChange={(e) => update("contactUrl", e.target.value)} />
                                </label>
                                <label className="admin-branding-field">
                                    <span>备案号</span>
                                    <Input value={draft.icpText} maxLength={120} placeholder="填写真实备案号，留空不展示" onChange={(e) => update("icpText", e.target.value)} />
                                </label>
                                <label className="admin-branding-field">
                                    <span>备案查询链接</span>
                                    <Input value={draft.icpUrl} maxLength={2048} placeholder="https://beian.miit.gov.cn/" onChange={(e) => update("icpUrl", e.target.value)} />
                                </label>
                            </div>
                        </>
                    ) : loading ? (
                        <Skeleton active paragraph={{ rows: 8 }} />
                    ) : (
                        <p>请重新读取网站设置后继续。</p>
                    )}
                </div>
            </fieldset>
            <div className="admin-branding-command-actions">
                <span className="admin-branding-save-state" role="status">
                    {saving ? "正在保存网站设置…" : loading ? "正在读取网站设置…" : error ? "未完成同步，输入已保留" : dirty ? "网站设置有未保存修改" : "网站设置已同步"}
                </span>
                <Button
                    icon={<RefreshCw className="size-4" />}
                    disabled={saving}
                    loading={loading}
                    onClick={() => {
                        if (!dirty) return void load();
                        modal.confirm({ title: "重新读取网站设置？", content: "将丢弃官网与备案中的未保存修改，读取当前已生效的设置。品牌设置草稿会保留。", okText: "丢弃修改并读取", cancelText: "继续编辑", onOk: () => load() });
                    }}
                >
                    重新读取
                </Button>
                {dirty && setting ? (
                    <Button
                        disabled={busy}
                        onClick={() => {
                            setDraft(publishedDisplay(setting));
                            setError("");
                        }}
                    >
                        撤销修改
                    </Button>
                ) : null}
                <Button type="primary" icon={<Save className="size-4" />} disabled={!dirty || busy} loading={saving} onClick={() => void save()}>
                    保存网站设置
                </Button>
            </div>
        </>
    );
}
