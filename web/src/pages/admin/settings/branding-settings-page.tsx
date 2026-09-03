import { App, Button, Input, Select, Skeleton } from "antd";
import { AlertTriangle, ExternalLink, MonitorSmartphone, Palette, RefreshCw, RotateCcw, Save, Type, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useBlocker } from "react-router";

import { BrandMark } from "@/components/branding/brand-mark";
import { toPublicBranding, useBranding } from "@/components/branding/branding-provider";
import { cn } from "@/lib/utils";
import { clearAdminBrandAsset, getAdminBranding, resetAdminBranding, updateAdminBranding, uploadAdminBrandAsset, type AdminBrandingSetting, type BrandAssetSlot, type BrandingConfig } from "@/services/api/branding";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import "./branding-settings-page.css";

type AssetDefinition = {
    slot: BrandAssetSlot;
    label: string;
    description: string;
    accept: string;
    referenceKey: keyof AdminBrandingSetting["assetReferences"];
};

const assetDefinitions: AssetDefinition[] = [
    { slot: "logo", label: "品牌标志", description: "建议透明背景、1:1 或接近方形，最大 2MB。", accept: "image/png,image/jpeg,image/webp,image/gif", referenceKey: "logoResourceId" },
    { slot: "favicon", label: "浏览器图标", description: "建议使用 64×64 或 128×128 的常用图片格式，最大 512KB。", accept: "image/png,image/jpeg,image/webp,image/gif", referenceKey: "faviconResourceId" },
    { slot: "auth-hero", label: "登录页背景", description: "支持图片或常用视频格式，视频最大 40MB；移动端不自动播放。", accept: "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm", referenceKey: "authHeroResourceId" },
    { slot: "auth-hero-poster", label: "视频海报", description: "视频加载前、移动端和减少动态效果时展示。", accept: "image/png,image/jpeg,image/webp,image/gif", referenceKey: "authHeroPosterResourceId" },
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

    const updateHeroURL = (value: string) => {
        if (!draft) return;
        setDraft({ ...draft, auth: { ...draft.auth, heroUrl: value, heroKind: value ? draft.auth.heroKind || "video" : "" } });
        setSaveError("");
    };

    if (loading && !draft) {
        return (
            <AdminPageFrame title="品牌与外观" description="统一管理站点身份、登录页与浏览器元信息" scroll>
                <div className="admin-branding-loading">
                    <Skeleton active paragraph={{ rows: 12 }} />
                </div>
            </AdminPageFrame>
        );
    }

    if (!setting || !draft) {
        return (
            <AdminPageFrame title="品牌与外观" description="统一管理站点身份、登录页与浏览器元信息" scroll>
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
        <AdminPageFrame title="品牌与外观" description="统一管理站点身份、登录页与浏览器元信息" scroll>
            <div className="admin-settings-stack admin-branding-settings">
                <div className={cn("admin-branding-command", dirty && "is-dirty")}>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <strong>{dirty ? "品牌文案有未保存调整" : "品牌配置已同步"}</strong>
                            <AdminStatusBadge label={dirty ? "尚未生效" : setting.configured ? `服务端修订 ${setting.revision}` : "系统默认"} tone={dirty ? "warning" : setting.configured ? "success" : "neutral"} />
                        </div>
                        <p>文件上传会立即生效；文案、颜色和资源链接需点击保存。每次变更均写入管理审计记录。</p>
                    </div>
                    <div className="admin-branding-command-actions">
                        {dirty ? (
                            <Button icon={<RotateCcw className="size-4" />} disabled={busy} onClick={() => setDraft(structuredClone(setting.config))}>
                                撤销文案调整
                            </Button>
                        ) : null}
                        <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={busy || dirty} onClick={() => void load()}>
                            刷新
                        </Button>
                        <Button danger icon={<RotateCcw className="size-4" />} loading={resetting} disabled={busy} onClick={requestReset}>
                            恢复默认
                        </Button>
                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || busy} onClick={() => void save()}>
                            保存修改
                        </Button>
                    </div>
                </div>

                {loadError || saveError ? (
                    <div className="admin-branding-inline-error" role="alert">
                        <AlertTriangle className="size-4" />
                        <span>{saveError || `${loadError}。页面仍保留上次成功读取的配置。`}</span>
                    </div>
                ) : null}

                <section className="admin-branding-summary" aria-label="当前品牌摘要" style={{ "--brand-summary-color": draft.theme.primaryColor } as React.CSSProperties}>
                    <span className="admin-branding-summary-mark">
                        <BrandMark className="size-8" />
                    </span>
                    <div className="admin-branding-summary-copy">
                        <small>品牌展示</small>
                        <strong>{draft.identity.displayName || "未命名品牌"}</strong>
                        <p>{draft.identity.slogan || draft.identity.description || "填写品牌标语，让用户快速了解你的工作台。"}</p>
                        <div>
                            <span>{draft.identity.workspaceLabel || "工作区"}</span>
                            <span>
                                <i aria-hidden="true" />
                                主题色
                            </span>
                            <span>{setting.assets.authHeroKind === "video" ? "视频背景" : setting.assets.authHeroKind === "image" ? "图片背景" : "默认背景"}</span>
                        </div>
                    </div>
                    <Button href="/login" target="_blank" rel="noreferrer" icon={<ExternalLink className="size-4" />}>
                        查看登录页
                    </Button>
                </section>

                <div className="admin-branding-form-stack">
                    <SettingsSectionCard icon={<Palette className="size-4" />} title="1. 基础品牌" description="设置名称、标语和主题色，保存后同步到登录页与工作台。">
                        <div className="admin-branding-fields two-columns">
                            <BrandField label="品牌名称">
                                <Input value={draft.identity.displayName} maxLength={40} onChange={(event) => updateDraft("identity", "displayName", event.target.value)} />
                            </BrandField>
                            <BrandField label="短名称">
                                <Input value={draft.identity.shortName} maxLength={20} onChange={(event) => updateDraft("identity", "shortName", event.target.value)} />
                            </BrandField>
                            <BrandField label="工作区说明">
                                <Input value={draft.identity.workspaceLabel} maxLength={40} onChange={(event) => updateDraft("identity", "workspaceLabel", event.target.value)} />
                            </BrandField>
                        </div>
                        <BrandField label="品牌标语">
                            <Input value={draft.identity.slogan} maxLength={160} onChange={(event) => updateDraft("identity", "slogan", event.target.value)} />
                        </BrandField>
                        <BrandField label="平台简介">
                            <Input.TextArea value={draft.identity.description} maxLength={400} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateDraft("identity", "description", event.target.value)} />
                        </BrandField>
                        <div className="admin-branding-subsection">
                            <div>
                                <strong>主题色</strong>
                                <p>自动生成明暗色阶和按钮前景色。</p>
                            </div>
                            <div className="admin-branding-color-row">
                                <input aria-label="选择品牌主题色" type="color" value={draft.theme.primaryColor} onChange={(event) => updateDraft("theme", "primaryColor", event.target.value.toUpperCase())} />
                                <Input value={draft.theme.primaryColor} maxLength={7} onChange={(event) => updateDraft("theme", "primaryColor", event.target.value.toUpperCase())} />
                                <span style={{ background: draft.theme.primaryColor }} aria-hidden="true" />
                            </div>
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard icon={<MonitorSmartphone className="size-4" />} title="2. 登录页" description="编辑登录文案、背景和品牌资源；移动端自动使用海报。">
                        <BrandField label="主标题">
                            <Input.TextArea value={draft.auth.title} maxLength={140} autoSize={{ minRows: 2, maxRows: 3 }} onChange={(event) => updateDraft("auth", "title", event.target.value)} />
                        </BrandField>
                        <BrandField label="辅助说明">
                            <Input.TextArea value={draft.auth.description} maxLength={300} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateDraft("auth", "description", event.target.value)} />
                        </BrandField>
                        <div className="admin-branding-subsection">
                            <div>
                                <strong>背景与资源</strong>
                                <p>支持本站上传，也可使用 B 站安全直链；外链优先生效。</p>
                            </div>
                            <div className="admin-branding-external-assets">
                                <div className="admin-branding-external-hero-row">
                                    <BrandField label="登录页背景链接">
                                        <Input value={draft.auth.heroUrl} maxLength={2048} allowClear placeholder="https://.../background.mp4" onChange={(event) => updateHeroURL(event.target.value)} />
                                    </BrandField>
                                    <BrandField label="背景类型">
                                        <Select
                                            aria-label="登录页背景类型"
                                            value={draft.auth.heroKind || "video"}
                                            disabled={!draft.auth.heroUrl}
                                            options={[
                                                { value: "video", label: "视频" },
                                                { value: "image", label: "图片" },
                                            ]}
                                            onChange={(value) => updateDraft("auth", "heroKind", value)}
                                        />
                                    </BrandField>
                                </div>
                                <BrandField label="视频海报链接（可选）">
                                    <Input value={draft.auth.heroPosterUrl} maxLength={2048} allowClear placeholder="https://.../poster.jpg" onChange={(event) => updateDraft("auth", "heroPosterUrl", event.target.value)} />
                                </BrandField>
                                <p>仅允许以 https:// 开头的完整安全链接。清空后会回到下方已上传的素材；上传新文件时会切回本站存储。</p>
                            </div>
                            <div className="admin-branding-assets">
                                {assetDefinitions.map((asset) => {
                                    const configured = Boolean(setting.assetReferences[asset.referenceKey]);
                                    return (
                                        <div key={asset.slot} className="admin-branding-asset-row">
                                            <div>
                                                <strong>{asset.label}</strong>
                                                <p>{asset.description}</p>
                                            </div>
                                            <div className="admin-branding-asset-actions">
                                                <AdminStatusBadge label={configured ? "已配置" : "使用默认"} tone={configured ? "success" : "neutral"} />
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
                                                    上传
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard icon={<Type className="size-4" />} title="3. 浏览器信息" description="作用于标签页标题、搜索摘要和收藏夹识别。">
                        <BrandField label="浏览器标题">
                            <Input value={draft.browser.title} maxLength={80} onChange={(event) => updateDraft("browser", "title", event.target.value)} />
                        </BrandField>
                        <BrandField label="搜索摘要">
                            <Input.TextArea value={draft.browser.metaDescription} maxLength={300} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => updateDraft("browser", "metaDescription", event.target.value)} />
                        </BrandField>
                    </SettingsSectionCard>
                </div>
            </div>
        </AdminPageFrame>
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
