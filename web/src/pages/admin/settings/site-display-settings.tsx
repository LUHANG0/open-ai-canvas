import { App, Button, Input, Skeleton } from "antd";
import { AlertTriangle, ExternalLink, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { getAdminPublicSite, updateAdminSiteDisplay, type AdminPublicSiteSetting, type SiteDisplaySettings } from "@/services/api/public-site";

function publishedDisplay(setting: AdminPublicSiteSetting): SiteDisplaySettings {
    return { posterUrl: setting.published.hero.posterUrl, contactUrl: setting.published.links.contactUrl, icpText: setting.published.links.icpText, icpUrl: setting.published.links.icpUrl || "https://beian.miit.gov.cn/" };
}

export function SiteDisplaySettingsEditor({ onDirtyChange, onBusyChange }: { onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void }) {
    const { message } = App.useApp();
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
            setError(detail);
            message.error(detail);
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
                    <p>保存后同步到官网和登录页。</p>
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
                            <label className="admin-branding-field">
                                <span>官网与登录页封面</span>
                                <Input value={draft.posterUrl} maxLength={2048} placeholder="图片地址，留空使用内置品牌海报" onChange={(e) => update("posterUrl", e.target.value)} />
                            </label>
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
                        </>
                    ) : loading ? (
                        <Skeleton active paragraph={{ rows: 8 }} />
                    ) : (
                        <p>请重新读取网站设置后继续。</p>
                    )}
                </div>
            </fieldset>
            <div className="admin-branding-command-actions">
                <Button icon={<RefreshCw className="size-4" />} disabled={dirty || saving} loading={loading} onClick={() => void load()}>
                    刷新
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
