import { App, Button, Input, Skeleton } from "antd";
import { AlertTriangle, ArrowUpRight, Eye, Globe2, Plus, RefreshCw, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useBlocker } from "react-router";

import { cn } from "@/lib/utils";
import { getAdminPublicSite, publishAdminPublicSite, resetAdminPublicSiteDraft, updateAdminPublicSiteDraft, type AdminPublicSiteSetting, type PublicSiteConfig } from "@/services/api/public-site";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import "./public-site-settings-page.css";

const { TextArea } = Input;

type Field = { key: string; label: string; placeholder?: string; textarea?: boolean };
const heroFields: Field[] = [
    { key: "eyebrow", label: "眉题" },
    { key: "title", label: "主标题" },
    { key: "description", label: "主说明", textarea: true },
    { key: "primaryCta", label: "主按钮" },
    { key: "secondaryCta", label: "次按钮" },
    { key: "showreelLabel", label: "片场标识" },
    { key: "showreelUrl", label: "背景视频 URL", placeholder: "支持 HTTPS 视频地址；留空则复用登录页背景" },
    { key: "posterUrl", label: "视频海报 URL", placeholder: "支持 HTTPS 图片地址" },
];

const sectionFields: Field[] = [
    { key: "productTitle", label: "产品标题", textarea: true },
    { key: "productDescription", label: "产品说明", textarea: true },
    { key: "workflowTitle", label: "流程标题", textarea: true },
    { key: "workflowDescription", label: "流程说明", textarea: true },
    { key: "showcaseTitle", label: "作品标题", textarea: true },
    { key: "showcaseDescription", label: "作品说明", textarea: true },
    { key: "aboutTitle", label: "关于标题", textarea: true },
    { key: "aboutDescription", label: "关于说明", textarea: true },
];

export default function PublicSiteSettingsPage() {
    const { message, modal } = App.useApp();
    const [setting, setSetting] = useState<AdminPublicSiteSetting | null>(null);
    const [draft, setDraft] = useState<PublicSiteConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<"" | "save" | "publish" | "reset">("");
    const [error, setError] = useState("");
    const requestVersion = useRef(0);

    const load = useCallback(async () => {
        const version = ++requestVersion.current;
        setLoading(true);
        setError("");
        try {
            const { setting: next } = await getAdminPublicSite();
            if (version !== requestVersion.current) return;
            setSetting(next);
            setDraft(structuredClone(next.draft));
        } catch (cause) {
            if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : "读取官网内容失败");
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        return () => {
            requestVersion.current += 1;
        };
    }, [load]);
    const localDirty = Boolean(setting && draft && JSON.stringify(setting.draft) !== JSON.stringify(draft));
    const blocker = useBlocker(localDirty && !busy);
    useEffect(() => {
        if (blocker.state !== "blocked") return;
        modal.confirm({
            title: "放弃尚未保存的官网调整？",
            content: "离开后，本地表单中的修改会丢失。已保存的草稿不会受影响。",
            okText: "放弃并离开",
            cancelText: "继续编辑",
            okButtonProps: { danger: true },
            onOk: () => blocker.proceed(),
            onCancel: () => blocker.reset(),
        });
    }, [blocker, modal]);
    useEffect(() => {
        const before = (event: BeforeUnloadEvent) => {
            if (localDirty) event.preventDefault();
        };
        window.addEventListener("beforeunload", before);
        return () => window.removeEventListener("beforeunload", before);
    }, [localDirty]);

    const update = (group: "hero" | "sections" | "links" | "seo", key: string, value: string) => {
        setDraft((current) => (current ? { ...current, [group]: { ...current[group], [key]: value } } : current));
        setError("");
    };
    const updateShowcase = (index: number, key: string, value: string) => setDraft((current) => (current ? { ...current, showcases: current.showcases.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)) } : current));
    const addShowcase = () =>
        setDraft((current) =>
            !current || current.showcases.length >= 8
                ? current
                : { ...current, showcases: [...current.showcases, { id: `work-${Date.now()}`, title: "新作品", category: "作品分类", description: "填写作品说明。", coverUrl: "", videoUrl: "", externalUrl: "" }] },
        );
    const removeShowcase = (index: number) => setDraft((current) => (current ? { ...current, showcases: current.showcases.filter((_, itemIndex) => itemIndex !== index) } : current));

    const save = async () => {
        if (!setting || !draft || !localDirty || busy) return setting;
        setBusy("save");
        setError("");
        try {
            const { setting: next } = await updateAdminPublicSiteDraft(setting.revision, draft);
            setSetting(next);
            setDraft(structuredClone(next.draft));
            message.success("官网草稿已保存");
            return next;
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : "保存失败";
            setError(`${detail}。如有修订冲突，请刷新后重新编辑。`);
            message.error(detail);
            return null;
        } finally {
            setBusy("");
        }
    };
    const publish = async () => {
        if (!setting || busy || localDirty) return;
        setBusy("publish");
        setError("");
        try {
            const { setting: next } = await publishAdminPublicSite(setting.revision);
            setSetting(next);
            setDraft(structuredClone(next.draft));
            message.success("官网内容已发布");
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : "发布失败";
            setError(detail);
            message.error(detail);
        } finally {
            setBusy("");
        }
    };
    const requestReset = () => {
        if (!setting || busy) return;
        modal.confirm({
            title: "将草稿恢复为默认官网内容？",
            content: "只重置草稿，线上已发布内容不会改变；确认发布后才会更新公开官网。",
            okText: "重置草稿",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setBusy("reset");
                try {
                    const { setting: next } = await resetAdminPublicSiteDraft(setting.revision);
                    setSetting(next);
                    setDraft(structuredClone(next.draft));
                    message.success("官网草稿已恢复默认");
                } catch (cause) {
                    message.error(cause instanceof Error ? cause.message : "重置失败");
                } finally {
                    setBusy("");
                }
            },
        });
    };

    const status = useMemo(() => (localDirty ? { label: "本地未保存", tone: "warning" as const } : setting?.dirty ? { label: "草稿待发布", tone: "warning" as const } : { label: "线上已同步", tone: "success" as const }), [localDirty, setting?.dirty]);

    if (loading && !draft)
        return (
            <AdminPageFrame title="官网内容" description="管理公开页面、案例与发布版本" scroll>
                <Skeleton active paragraph={{ rows: 14 }} />
            </AdminPageFrame>
        );
    if (!setting || !draft)
        return (
            <AdminPageFrame title="官网内容" description="管理公开页面、案例与发布版本" scroll>
                <div className="admin-public-site-error">
                    <AlertTriangle />
                    <div>
                        <strong>无法读取官网内容</strong>
                        <p>{error || "请稍后重试"}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => void load()}>
                        重新读取
                    </Button>
                </div>
            </AdminPageFrame>
        );

    return (
        <AdminPageFrame
            title="官网内容"
            description="管理公开页面、案例与发布版本"
            scroll
            actions={
                <Button href="/" target="_blank" icon={<ArrowUpRight className="size-4" />}>
                    查看线上官网
                </Button>
            }
        >
            <div className="admin-settings-stack admin-public-site-settings">
                <div className={cn("admin-public-site-command", (localDirty || setting.dirty) && "is-dirty")}>
                    <div>
                        <div className="admin-public-site-status">
                            <strong>草稿 → 检查 → 发布</strong>
                            <AdminStatusBadge label={status.label} tone={status.tone} />
                            <AdminStatusBadge label={`修订 ${setting.revision}`} tone="neutral" />
                        </div>
                        <p>保存草稿不会影响公开官网；只有点击发布后访客才会看到新内容。所有动作写入管理审计。</p>
                    </div>
                    <div className="admin-public-site-actions">
                        <Button icon={<RotateCcw className="size-4" />} danger disabled={Boolean(busy)} loading={busy === "reset"} onClick={requestReset}>
                            默认草稿
                        </Button>
                        <Button icon={<Save className="size-4" />} disabled={!localDirty || Boolean(busy)} loading={busy === "save"} onClick={() => void save()}>
                            保存草稿
                        </Button>
                        <Button type="primary" icon={<Send className="size-4" />} disabled={localDirty || !setting.dirty || Boolean(busy)} loading={busy === "publish"} onClick={() => void publish()}>
                            发布官网
                        </Button>
                    </div>
                </div>
                {error ? (
                    <div className="admin-public-site-inline-error" role="alert">
                        <AlertTriangle className="size-4" />
                        {error}
                    </div>
                ) : null}
                <div className="admin-public-site-grid">
                    <div className="admin-public-site-form">
                        <SettingsSectionCard icon={<Globe2 className="size-4" />} title="首页首屏" description="背景视频留空时，自动使用品牌与外观中的登录页背景。">
                            <div className="admin-public-site-fields">
                                {heroFields.map((field) => (
                                    <LabeledField key={field.key} field={field} value={draft.hero[field.key as keyof typeof draft.hero]} onChange={(value) => update("hero", field.key, value)} />
                                ))}
                            </div>
                        </SettingsSectionCard>
                        <SettingsSectionCard icon={<Eye className="size-4" />} title="页面章节" description="标题支持换行，用于首页与对应内页的主叙事。">
                            <div className="admin-public-site-fields">
                                {sectionFields.map((field) => (
                                    <LabeledField key={field.key} field={field} value={draft.sections[field.key as keyof typeof draft.sections]} onChange={(value) => update("sections", field.key, value)} />
                                ))}
                            </div>
                        </SettingsSectionCard>
                        <SettingsSectionCard
                            icon={<Eye className="size-4" />}
                            title="作品与案例"
                            description="最多 8 个；外部链接可填写 B 站 HTTPS URL，封面与视频均支持独立 URL。"
                            status={
                                <Button icon={<Plus className="size-4" />} disabled={draft.showcases.length >= 8} onClick={addShowcase}>
                                    添加作品
                                </Button>
                            }
                        >
                            <div className="admin-public-site-showcases">
                                {draft.showcases.map((item, index) => (
                                    <article key={item.id}>
                                        <header>
                                            <span>{String(index + 1).padStart(2, "0")}</span>
                                            <strong>{item.title || "未命名作品"}</strong>
                                            <Button type="text" danger aria-label="删除作品" icon={<Trash2 className="size-4" />} onClick={() => removeShowcase(index)} />
                                        </header>
                                        <div className="admin-public-site-fields">
                                            <Labeled label="标题">
                                                <Input value={item.title} onChange={(event) => updateShowcase(index, "title", event.target.value)} />
                                            </Labeled>
                                            <Labeled label="分类">
                                                <Input value={item.category} onChange={(event) => updateShowcase(index, "category", event.target.value)} />
                                            </Labeled>
                                            <Labeled label="说明" wide>
                                                <TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={item.description} onChange={(event) => updateShowcase(index, "description", event.target.value)} />
                                            </Labeled>
                                            <Labeled label="封面 URL">
                                                <Input value={item.coverUrl} onChange={(event) => updateShowcase(index, "coverUrl", event.target.value)} />
                                            </Labeled>
                                            <Labeled label="视频 URL">
                                                <Input value={item.videoUrl} onChange={(event) => updateShowcase(index, "videoUrl", event.target.value)} />
                                            </Labeled>
                                            <Labeled label="B站/外部作品 URL" wide>
                                                <Input value={item.externalUrl} onChange={(event) => updateShowcase(index, "externalUrl", event.target.value)} />
                                            </Labeled>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </SettingsSectionCard>
                        <SettingsSectionCard icon={<ArrowUpRight className="size-4" />} title="链接与搜索摘要" description="内部地址使用 / 开头，外部地址必须使用 HTTPS。">
                            <div className="admin-public-site-fields">
                                <Labeled label="代码仓库 URL">
                                    <Input value={draft.links.repositoryUrl} onChange={(e) => update("links", "repositoryUrl", e.target.value)} />
                                </Labeled>
                                <Labeled label="部署说明 URL">
                                    <Input value={draft.links.deploymentUrl} onChange={(e) => update("links", "deploymentUrl", e.target.value)} />
                                </Labeled>
                                <Labeled label="文档 URL">
                                    <Input value={draft.links.docsUrl} onChange={(e) => update("links", "docsUrl", e.target.value)} />
                                </Labeled>
                                <Labeled label="联系 URL">
                                    <Input value={draft.links.contactUrl} onChange={(e) => update("links", "contactUrl", e.target.value)} />
                                </Labeled>
                                <Labeled label="备案信息" wide>
                                    <Input value={draft.links.icpText} onChange={(e) => update("links", "icpText", e.target.value)} />
                                </Labeled>
                                <Labeled label="首页浏览器标题" wide>
                                    <Input value={draft.seo.homeTitle} onChange={(e) => update("seo", "homeTitle", e.target.value)} />
                                </Labeled>
                                <Labeled label="首页搜索摘要" wide>
                                    <TextArea autoSize={{ minRows: 2 }} value={draft.seo.homeDescription} onChange={(e) => update("seo", "homeDescription", e.target.value)} />
                                </Labeled>
                            </div>
                        </SettingsSectionCard>
                    </div>
                    <aside className="admin-public-site-preview">
                        <div className="admin-public-site-preview-browser">
                            <header>
                                <i />
                                <i />
                                <i />
                                <span>官网草稿预览</span>
                            </header>
                            <div>
                                <small>{draft.hero.eyebrow}</small>
                                <h2>{draft.hero.title}</h2>
                                <p>{draft.hero.description}</p>
                                <b>{draft.hero.primaryCta}</b>
                            </div>
                        </div>
                        <p>预览展示当前表单中的首屏文案。完整布局可在保存并发布后通过“查看线上官网”检查。</p>
                        <Link to="/" target="_blank">
                            <ArrowUpRight className="size-4" />
                            打开官网
                        </Link>
                    </aside>
                </div>
            </div>
        </AdminPageFrame>
    );
}

function LabeledField({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) {
    return (
        <Labeled label={field.label} wide={field.textarea || field.key.endsWith("Url")}>
            {field.textarea ? (
                <TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />
            ) : (
                <Input value={value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />
            )}
        </Labeled>
    );
}
function Labeled({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
    return (
        <label className={wide ? "is-wide" : ""}>
            <span>{label}</span>
            {children}
        </label>
    );
}
