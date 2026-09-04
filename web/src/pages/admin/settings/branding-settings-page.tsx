import { App, Button, Input, Skeleton } from "antd";
import { AlertTriangle, ExternalLink, Image as ImageIcon, MonitorSmartphone, Palette, RefreshCw, RotateCcw, Save, Type, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useBlocker } from "react-router";

import { BrandMark } from "@/components/branding/brand-mark";
import { toPublicBranding, useBranding } from "@/components/branding/branding-provider";
import { cn } from "@/lib/utils";
import { clearAdminBrandAsset, getAdminBranding, resetAdminBranding, updateAdminBranding, uploadAdminBrandAsset, type AdminBrandingSetting, type BrandAssetSlot, type BrandingConfig } from "@/services/api/branding";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge } from "../components/admin-ui";
import "./branding-settings-page.css";

type AssetDefinition = {
    slot: BrandAssetSlot;
    label: string;
    description: string;
    accept: string;
    referenceKey: keyof AdminBrandingSetting["assetReferences"];
};

type BrandSection = "identity" | "visual" | "login" | "browser";

const assetDefinitions: AssetDefinition[] = [
    { slot: "logo", label: "品牌标志", description: "建议透明背景、1:1 或接近方形，最大 2MB。", accept: "image/png,image/jpeg,image/webp,image/gif", referenceKey: "logoResourceId" },
    { slot: "favicon", label: "浏览器图标", description: "建议使用 64×64 或 128×128 的常用图片格式，最大 512KB。", accept: "image/png,image/jpeg,image/webp,image/gif", referenceKey: "faviconResourceId" },
];

export default function BrandingSettingsPage() {
    const { message, modal } = App.useApp();
    const { replace } = useBranding();
    const [setting, setSetting] = useState<AdminBrandingSetting | null>(null);
    const [draft, setDraft] = useState<BrandingConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [uploadingSlot, setUploadingSlot] = useState<BrandAssetSlot | "">("");
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [activeSection, setActiveSection] = useState<BrandSection>("identity");
    const requestVersionRef = useRef(0);
    const fileInputs = useRef<Partial<Record<BrandAssetSlot, HTMLInputElement | null>>>({});

    const load = useCallback(
        async (initial = false) => {
            const requestVersion = ++requestVersionRef.current;
            initial ? setLoading(true) : setRefreshing(true);
            setLoadError("");
            try {
                const { setting: next } = await getAdminBranding();
                if (requestVersion !== requestVersionRef.current) return;
                setSetting(next);
                setDraft(structuredClone(next.config));
                replace(toPublicBranding(next));
                setSaveError("");
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                setLoadError(error instanceof Error ? error.message : "读取品牌配置失败");
            } finally {
                if (requestVersion === requestVersionRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [replace],
    );

    useEffect(() => {
        void load(true);
        return () => {
            requestVersionRef.current += 1;
        };
    }, [load]);

    const dirty = Boolean(setting && draft && JSON.stringify(setting.config) !== JSON.stringify(draft));
    const busy = saving || resetting || Boolean(uploadingSlot);
    const blocker = useBlocker(dirty && !saving);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!dirty || saving) return;
            event.preventDefault();
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [dirty, saving]);

    useEffect(() => {
        if (blocker.state !== "blocked") return;
        modal.confirm({
            title: "放弃品牌配置调整？",
            content: "当前文案、颜色或资源链接还没有保存，离开后会丢失。",
            okText: "放弃并离开",
            cancelText: "继续编辑",
            okButtonProps: { danger: true },
            onOk: () => blocker.proceed(),
            onCancel: () => blocker.reset(),
        });
    }, [blocker, modal]);

    const applySetting = (next: AdminBrandingSetting, preserveDraft = false) => {
        setSetting(next);
        if (!preserveDraft) setDraft(structuredClone(next.config));
        replace(toPublicBranding(next));
        setSaveError("");
    };

    const save = async () => {
        if (!setting || !draft || !dirty || busy) return;
        setSaving(true);
        setSaveError("");
        try {
            const { setting: next } = await updateAdminBranding(setting.revision, normalizeDraft(draft));
            applySetting(next);
            message.success("品牌与登录页配置已生效");
        } catch (error) {
            const detail = error instanceof Error ? error.message : "保存品牌配置失败";
            setSaveError(`${detail}。未自动重试，请刷新后再保存。`);
            message.error(detail);
        } finally {
            setSaving(false);
        }
    };

    const uploadAsset = async (slot: BrandAssetSlot, event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !setting || busy) return;
        setUploadingSlot(slot);
        try {
            const { setting: next } = await uploadAdminBrandAsset(slot, setting.revision, file);
            applySetting(next, dirty);
            if (dirty && draft && slot === "auth-hero") {
                setDraft({ ...draft, auth: { ...draft.auth, heroUrl: "", heroKind: "" } });
            }
            if (dirty && draft && slot === "auth-hero-poster") {
                setDraft({ ...draft, auth: { ...draft.auth, heroPosterUrl: "" } });
            }
            message.success("品牌资源已上传并生效");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传品牌资源失败");
        } finally {
            setUploadingSlot("");
        }
    };

    const clearAsset = async (slot: BrandAssetSlot) => {
        if (!setting || busy) return;
        setUploadingSlot(slot);
        try {
            const { setting: next } = await clearAdminBrandAsset(slot, setting.revision);
            applySetting(next, dirty);
            message.success("已移除该品牌资源");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "移除品牌资源失败");
        } finally {
            setUploadingSlot("");
        }
    };

    const requestReset = () => {
        if (!setting || busy) return;
        modal.confirm({
            title: "恢复默认品牌？",
            content: "品牌名称、颜色、登录页文案和当前品牌资源将恢复为影策默认值。历史资源不会立即物理删除，可用于人工回滚。",
            okText: "恢复默认",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setResetting(true);
                try {
                    const { setting: next } = await resetAdminBranding(setting.revision);
                    applySetting(next);
                    message.success("已恢复默认品牌");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "恢复默认品牌失败");
                } finally {
                    setResetting(false);
                }
            },
        });
    };

    const updateDraft = (section: keyof BrandingConfig, key: string, value: string) => {
        if (!draft) return;
        setDraft({ ...draft, [section]: { ...draft[section], [key]: value } });
        setSaveError("");
    };

    if (loading && !draft) {
        return (
            <AdminPageFrame title="品牌中心" description="管理网站名称、视觉资源和登录入口" scroll>
                <div className="admin-branding-loading">
                    <Skeleton active paragraph={{ rows: 12 }} />
                </div>
            </AdminPageFrame>
        );
    }

    if (!setting || !draft) {
        return (
            <AdminPageFrame title="品牌中心" description="管理网站名称、视觉资源和登录入口" scroll>
                <div className="admin-branding-error" role="alert">
                    <AlertTriangle className="size-5" />
                    <div>
                        <strong>无法读取品牌配置</strong>
                        <p>{loadError || "请稍后重试。"}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => void load(true)}>
                        重新读取
                    </Button>
                </div>
            </AdminPageFrame>
        );
    }

    return (
        <AdminPageFrame title="品牌中心" description="管理网站名称、视觉资源和登录入口" scroll>
            <div className="admin-settings-stack admin-branding-settings">
                <div className="admin-branding-workspace">
                    <aside className="admin-branding-summary" aria-label="品牌配置分区">
                        <div className="admin-branding-identity">
                            <span className="admin-branding-logo">
                                <BrandMark className="size-12" />
                            </span>
                            <h2>{draft.identity.displayName || "未命名品牌"}</h2>
                            <div className={cn("admin-branding-sync-state", dirty && "is-dirty")}>
                                <AdminStatusBadge label={dirty ? "有未保存修改" : setting.configured ? "已保存" : "使用默认"} tone={dirty ? "warning" : setting.configured ? "success" : "neutral"} />
                                <span>修订 {setting.revision}</span>
                            </div>
                        </div>
                        <nav className="admin-branding-section-nav">
                            <BrandSectionButton active={activeSection === "identity"} icon={<Type className="size-4" />} label="品牌资料" onClick={() => setActiveSection("identity")} />
                            <BrandSectionButton active={activeSection === "visual"} icon={<Palette className="size-4" />} label="标志与颜色" onClick={() => setActiveSection("visual")} />
                            <BrandSectionButton active={activeSection === "login"} icon={<MonitorSmartphone className="size-4" />} label="登录页面" onClick={() => setActiveSection("login")} />
                            <BrandSectionButton active={activeSection === "browser"} icon={<ImageIcon className="size-4" />} label="浏览器显示" onClick={() => setActiveSection("browser")} />
                        </nav>
                        <div className="admin-branding-theme-chip">
                            <span style={{ background: draft.theme.primaryColor }} aria-hidden="true" />
                            <div>
                                <small>当前主题色</small>
                                <strong>{draft.theme.primaryColor}</strong>
                            </div>
                        </div>
                    </aside>

                    <div className="admin-branding-editor">
                        <div className="admin-branding-editor-head">
                            <div>
                                <strong>{dirty ? "修改尚未保存" : "配置已同步"}</strong>
                                <p>上传文件会立即生效，文字、颜色和链接需保存后生效。</p>
                            </div>
                            <Button href="/login" target="_blank" rel="noreferrer" icon={<ExternalLink className="size-4" />}>
                                查看登录页
                            </Button>
                        </div>

                        {loadError || saveError ? (
                            <div className="admin-branding-inline-error" role="alert">
                                <AlertTriangle className="size-4" />
                                <span>{saveError || `${loadError}。页面仍保留上次成功读取的配置。`}</span>
                            </div>
                        ) : null}

                        <div className="admin-branding-editor-sheet">
                            {activeSection === "identity" ? (
                                <BrandPanel icon={<Type className="size-4" />} title="品牌资料" description="这些内容会同步到登录页、工作台和分享页面。">
                                    <BrandField label="品牌名称">
                                        <Input value={draft.identity.displayName} maxLength={40} onChange={(event) => updateDraft("identity", "displayName", event.target.value)} />
                                    </BrandField>
                                    <BrandField label="短名称">
                                        <Input value={draft.identity.shortName} maxLength={20} onChange={(event) => updateDraft("identity", "shortName", event.target.value)} />
                                    </BrandField>
                                    <BrandField label="工作区名称">
                                        <Input value={draft.identity.workspaceLabel} maxLength={40} onChange={(event) => updateDraft("identity", "workspaceLabel", event.target.value)} />
                                    </BrandField>
                                    <BrandField label="品牌标语">
                                        <Input value={draft.identity.slogan} maxLength={160} onChange={(event) => updateDraft("identity", "slogan", event.target.value)} />
                                    </BrandField>
                                    <BrandField label="平台简介">
                                        <Input.TextArea value={draft.identity.description} maxLength={400} autoSize={{ minRows: 4, maxRows: 6 }} onChange={(event) => updateDraft("identity", "description", event.target.value)} />
                                    </BrandField>
                                </BrandPanel>
                            ) : null}

                            {activeSection === "visual" ? (
                                <BrandPanel icon={<Palette className="size-4" />} title="标志与颜色" description="上传品牌图片并设置全站主要强调颜色。">
                                    <div className="admin-branding-assets-grid">{assetDefinitions.slice(0, 2).map((asset) => renderAssetEditor(asset, setting, busy, uploadingSlot, fileInputs, uploadAsset, clearAsset))}</div>
                                    <div className="admin-branding-subsection">
                                        <div>
                                            <strong>主题颜色</strong>
                                            <p>用于链接、焦点和选中状态。</p>
                                        </div>
                                        <div className="admin-branding-color-row">
                                            <input aria-label="选择品牌主题色" type="color" value={draft.theme.primaryColor} onChange={(event) => updateDraft("theme", "primaryColor", event.target.value.toUpperCase())} />
                                            <Input value={draft.theme.primaryColor} maxLength={7} onChange={(event) => updateDraft("theme", "primaryColor", event.target.value.toUpperCase())} />
                                            <span style={{ background: draft.theme.primaryColor }} aria-hidden="true" />
                                        </div>
                                    </div>
                                </BrandPanel>
                            ) : null}

                            {activeSection === "login" ? (
                                <BrandPanel icon={<MonitorSmartphone className="size-4" />} title="登录页面" description="设置登录页的故事标题与说明；品牌海报和备案信息与官网共用。">
                                    <BrandField label="画面标题">
                                        <Input.TextArea value={draft.auth.title} maxLength={140} autoSize={{ minRows: 2, maxRows: 3 }} onChange={(event) => updateDraft("auth", "title", event.target.value)} />
                                    </BrandField>
                                    <BrandField label="画面说明">
                                        <Input.TextArea value={draft.auth.description} maxLength={300} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateDraft("auth", "description", event.target.value)} />
                                    </BrandField>
                                    <div className="admin-branding-subsection">
                                        <div>
                                            <strong>品牌海报</strong>
                                            <p>登录页使用官网首页的封面，留空时展示内置概念海报。修改后保存并发布官网内容即可同步。</p>
                                            <Link to="/admin/settings/public-site">前往官网内容设置 →</Link>
                                        </div>
                                    </div>
                                </BrandPanel>
                            ) : null}

                            {activeSection === "browser" ? (
                                <BrandPanel icon={<ImageIcon className="size-4" />} title="浏览器显示" description="设置浏览器标签标题和搜索结果摘要。">
                                    <BrandField label="浏览器标题">
                                        <Input value={draft.browser.title} maxLength={80} onChange={(event) => updateDraft("browser", "title", event.target.value)} />
                                    </BrandField>
                                    <BrandField label="搜索摘要">
                                        <Input.TextArea value={draft.browser.metaDescription} maxLength={300} autoSize={{ minRows: 4, maxRows: 6 }} onChange={(event) => updateDraft("browser", "metaDescription", event.target.value)} />
                                    </BrandField>
                                </BrandPanel>
                            ) : null}
                        </div>

                        <div className="admin-branding-command-actions">
                            <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={busy || dirty} onClick={() => void load()}>
                                刷新
                            </Button>
                            {dirty ? (
                                <Button icon={<RotateCcw className="size-4" />} disabled={busy} onClick={() => setDraft(structuredClone(setting.config))}>
                                    撤销修改
                                </Button>
                            ) : null}
                            <Button danger icon={<RotateCcw className="size-4" />} loading={resetting} disabled={busy} onClick={requestReset}>
                                恢复默认
                            </Button>
                            <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || busy} onClick={() => void save()}>
                                保存更改
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </AdminPageFrame>
    );
}

function BrandSectionButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button type="button" className={cn("admin-branding-section-button", active && "is-active")} aria-current={active ? "page" : undefined} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}

function BrandPanel({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="admin-branding-panel" aria-labelledby={`brand-panel-${title}`}>
            <header className="admin-branding-panel-header">
                <span aria-hidden="true">{icon}</span>
                <div>
                    <h2 id={`brand-panel-${title}`}>{title}</h2>
                    <p>{description}</p>
                </div>
            </header>
            <div className="admin-branding-panel-content">{children}</div>
        </section>
    );
}

function renderAssetEditor(
    asset: AssetDefinition,
    setting: AdminBrandingSetting,
    busy: boolean,
    uploadingSlot: BrandAssetSlot | "",
    fileInputs: React.RefObject<Partial<Record<BrandAssetSlot, HTMLInputElement | null>>>,
    uploadAsset: (slot: BrandAssetSlot, event: ChangeEvent<HTMLInputElement>) => Promise<void>,
    clearAsset: (slot: BrandAssetSlot) => Promise<void>,
) {
    const configured = Boolean(setting.assetReferences[asset.referenceKey]);
    return (
        <div key={asset.slot} className="admin-branding-asset-card">
            <div>
                <strong>{asset.label}</strong>
                <AdminStatusBadge label={configured ? "已配置" : "使用默认"} tone={configured ? "success" : "neutral"} />
            </div>
            <p>{asset.description}</p>
            <div className="admin-branding-asset-actions">
                <input
                    ref={(node) => {
                        fileInputs.current[asset.slot] = node;
                    }}
                    type="file"
                    accept={asset.accept}
                    hidden
                    onChange={(event) => void uploadAsset(asset.slot, event)}
                />
                {configured ? (
                    <Button danger size="small" disabled={busy} onClick={() => void clearAsset(asset.slot)}>
                        移除
                    </Button>
                ) : null}
                <Button size="small" icon={<Upload className="size-3.5" />} loading={uploadingSlot === asset.slot} disabled={busy && uploadingSlot !== asset.slot} onClick={() => fileInputs.current[asset.slot]?.click()}>
                    上传文件
                </Button>
            </div>
        </div>
    );
}

function BrandField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="admin-branding-field">
            <span>{label}</span>
            {children}
        </label>
    );
}

function normalizeDraft(config: BrandingConfig): BrandingConfig {
    return {
        identity: Object.fromEntries(Object.entries(config.identity).map(([key, value]) => [key, value.trim()])) as BrandingConfig["identity"],
        theme: { primaryColor: config.theme.primaryColor.trim().toUpperCase() },
        auth: Object.fromEntries(Object.entries(config.auth).map(([key, value]) => [key, value.trim()])) as BrandingConfig["auth"],
        browser: Object.fromEntries(Object.entries(config.browser).map(([key, value]) => [key, value.trim()])) as BrandingConfig["browser"],
    };
}
