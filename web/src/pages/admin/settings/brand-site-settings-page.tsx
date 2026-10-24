import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Link, useBlocker } from "react-router";
import { BrandSite } from "@/components/brand/brand-site";
import { AdminPageFrame } from "../components/admin-shell";
import { changeBrandSite, emptyBrandMedia, getAdminBrandSite, type BrandContent, type BrandMedia, type BrandSiteState } from "@/services/api/brand-site";
import { uploadAppearanceAsset } from "@/services/api/appearance";
import "./brand-site-settings.css";

function Field({ label, value, onChange, max = 500, multiline = false }: { label: string; value: string; onChange: (value: string) => void; max?: number; multiline?: boolean }) {
    return (
        <label className="mc-edit-field">
            <span>{label}</span>
            {multiline ? <textarea value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} rows={3} /> : <input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />}
        </label>
    );
}
function MediaEditor({ value, onChange, onError, busy, setBusy }: { value: BrandMedia; onChange: (value: BrandMedia) => void; onError: (value: string) => void; busy: boolean; setBusy: (value: boolean) => void }) {
    async function upload(file: File | undefined, poster = false) {
        if (!file) return;
        setBusy(true);
        try {
            const kind = file.type.startsWith("video/") ? "video" : "image";
            const resource = await uploadAppearanceAsset(`brand-${poster ? "image" : kind}`, file);
            onChange(poster ? { ...value, posterId: resource.id } : { ...emptyBrandMedia(), resourceId: resource.id, kind, alt: file.name });
        } catch (e) {
            onError(e instanceof Error ? e.message : "上传失败");
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="mc-edit-media">
            <label>
                图片或视频
                <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                    disabled={busy}
                    onChange={(e) => {
                        void upload(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
            </label>
            {value.resourceId && (
                <>
                    <Field label="媒体文字说明" value={value.alt} max={160} onChange={(alt) => onChange({ ...value, alt })} />
                    {value.kind === "video" && (
                        <label>
                            视频封面
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                disabled={busy}
                                onChange={(e) => {
                                    void upload(e.target.files?.[0], true);
                                    e.target.value = "";
                                }}
                            />
                        </label>
                    )}
                    <Button onClick={() => onChange(emptyBrandMedia())}>移除媒体引用</Button>
                </>
            )}
            <small>上传保持私有；只有手动发布后才公开。带语音的视频请使用含字幕的版本。</small>
        </div>
    );
}
export default function BrandSiteSettingsPage() {
    const [state, setState] = useState<BrandSiteState>();
    const [draft, setDraft] = useState<BrandContent>();
    const [section, setSection] = useState("hero");
    const [mobile, setMobile] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("正在读取官网草稿");
    const [confirmation, setConfirmation] = useState<"restore" | "reload" | null>(null);
    const [pendingAction, setPendingAction] = useState<"draft" | "publish" | "restore" | null>(null);
    const [fitPreview, setFitPreview] = useState(true);
    const [previewWidth, setPreviewWidth] = useState(1100);
    const previewRef = useRef<HTMLDivElement>(null);
    const dirty = !!state && JSON.stringify(state.draft) !== JSON.stringify(draft);
    const unpublished = !!state && JSON.stringify(state.published) !== JSON.stringify(draft);
    const blocker = useBlocker(dirty && !busy);
    async function load() {
        setBusy(true);
        setError("");
        try {
            const result = await getAdminBrandSite();
            setState(result);
            setDraft(result.draft);
            setStatus("已载入保存的草稿");
        } catch (e) {
            setError(e instanceof Error ? e.message : "读取失败");
        } finally {
            setBusy(false);
        }
    }
    useEffect(() => {
        void load();
    }, []);
    useEffect(() => {
        const element = previewRef.current;
        if (!element) return;
        const measure = () => setPreviewWidth(element.clientWidth);
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        measure();
        return () => observer.disconnect();
    }, [Boolean(draft)]);
    useEffect(() => {
        const before = (e: BeforeUnloadEvent) => {
            if (dirty) e.preventDefault();
        };
        window.addEventListener("beforeunload", before);
        return () => window.removeEventListener("beforeunload", before);
    }, [dirty]);
    async function action(kind: "draft" | "publish" | "restore") {
        if (!state || !draft || busy) return;
        setBusy(true);
        setPendingAction(kind);
        setError("");
        try {
            let current = state;
            if (kind === "draft" || (kind === "publish" && dirty)) {
                current = await changeBrandSite("draft", current.revision, draft);
                setState(current);
            }
            if (kind !== "draft") {
                current = await changeBrandSite(kind, current.revision);
                setState(current);
            }
            setStatus(kind === "draft" ? "草稿已保存，官网尚未改变" : kind === "publish" ? "官网已发布，新打开或刷新页面可见" : "已恢复上一完整发布版本，编辑草稿保持不变");
        } catch (e) {
            setError(`${kind === "publish" ? "发布失败或结果未能确认，请重新载入核对。" : "操作失败或结果未能确认，请重新载入核对。"}${e instanceof Error ? e.message : "请检查网络"}`);
        } finally {
            setBusy(false);
            setPendingAction(null);
        }
    }
    const patch = (value: Partial<BrandContent>) => draft && setDraft({ ...draft, ...value });
    const selected = draft?.sections.find((s) => s.id === section);
    return (
        <AdminPageFrame title="品牌官网" description="编辑与实时预览独立于公开版本；保存草稿后，再手动发布整版官网。" scroll>
            <div className="mc-edit-command">
                <div role="status" aria-live="polite">
                    <strong>{error ? "操作失败或状态待核对" : dirty ? "有未保存修改" : unpublished ? "草稿已保存 · 尚未发布" : state?.publishedAt ? "已发布" : "正在使用内置官网"}</strong>
                    <p>{status}</p>
                </div>
                <div>
                    <Button disabled={busy || !dirty} onClick={() => void action("draft")}>
                        保存草稿
                    </Button>
                    <Button type="primary" disabled={busy || !draft || (!unpublished && Boolean(state?.publishedAt))} loading={pendingAction === "publish"} onClick={() => void action("publish")}>
                        发布当前版本
                    </Button>
                    <Button disabled={busy || !state?.previous} onClick={() => setConfirmation("restore")}>
                        恢复上一发布版
                    </Button>
                    <a href="/" target="_blank" rel="noreferrer">
                        查看已发布官网
                    </a>
                </div>
            </div>
            {error && (
                <div className="mc-edit-error" role="alert">
                    {error}
                    <Button disabled={busy} onClick={() => (dirty ? setConfirmation("reload") : void load())}>
                        重新载入
                    </Button>
                </div>
            )}
            {blocker.state === "blocked" && (
                <div className="mc-edit-error" role="alert">
                    有未保存修改，离开将丢失。<Button onClick={() => blocker.reset()}>继续编辑</Button>
                    <Button onClick={() => blocker.proceed()}>放弃修改并离开</Button>
                </div>
            )}
            {draft && (
                <div className="mc-edit-layout">
                    <aside className="mc-edit-nav" aria-label="官网版块">
                        <Button aria-pressed={section === "hero"} onClick={() => setSection("hero")}>
                            首屏
                        </Button>
                        {draft.sections.map((s) => (
                            <Button key={s.id} aria-pressed={section === s.id} onClick={() => setSection(s.id)}>
                                {{ process: "创作过程", entries: "创作方式", examples: "影像画廊", faq: "常见问题" }[s.id]}
                            </Button>
                        ))}
                        <Button aria-pressed={section === "footer"} onClick={() => setSection("footer")}>
                            页尾
                        </Button>
                        <Link to="/admin/settings/appearance">全局品牌与登录页设置</Link>
                    </aside>
                    <fieldset className="mc-edit-form" disabled={busy}>
                        <legend>{section === "hero" ? "首屏内容" : section === "footer" ? "页尾内容" : selected?.title}</legend>
                        {section === "hero" && (
                            <>
                                <Field label="主标题" value={draft.title} max={100} onChange={(title) => patch({ title })} />
                                <Field label="定位说明" value={draft.description} max={240} onChange={(description) => patch({ description })} />
                                <Field label="补充介绍" value={draft.detail} onChange={(detail) => patch({ detail })} multiline />
                                <Field label="主按钮文字" value={draft.primaryLabel} max={30} onChange={(primaryLabel) => patch({ primaryLabel })} />
                                <p>主按钮固定进入 /create，保持官网与工作台入口约定。</p>
                                <MediaEditor value={draft.heroMedia} onChange={(heroMedia) => patch({ heroMedia })} onError={setError} busy={busy} setBusy={setBusy} />
                    <p>未上传时展示内置品牌主视觉。自定义视频由访客手动播放。</p>
                            </>
                        )}
                        {section === "process" && (
                            <>
                                <Field label="过程引言标题" value={draft.storyTitle} max={60} onChange={(storyTitle) => patch({ storyTitle })} />
                                <Field label="过程引言正文" value={draft.storyText} max={300} multiline onChange={(storyText) => patch({ storyText })} />
                                <Field label="过程示意说明" value={draft.storyCaption} max={160} onChange={(storyCaption) => patch({ storyCaption })} />
                                <p>启用创作过程且未上传首屏媒体时，显示此引言与说明。</p>
                            </>
                        )}
                        {section === "footer" && <Field label="收尾标题（留空则隐藏收尾区域）" value={draft.footer} max={240} onChange={(footer) => patch({ footer })} />}
                        {selected && (
                            <>
                                <label>
                                    <input type="checkbox" checked={selected.visible} onChange={(e) => patch({ sections: draft.sections.map((s) => (s.id === section ? { ...s, visible: e.target.checked } : s)) })} /> 在官网显示此版块
                                </label>
                                <div className="mc-edit-order">
                                    {[-1, 1].map((step) => (
                                        <Button
                                            key={step}
                                            disabled={busy || draft.sections.indexOf(selected) + step < 0 || draft.sections.indexOf(selected) + step >= draft.sections.length}
                                            onClick={() => {
                                                const list = [...draft.sections];
                                                const i = list.indexOf(selected);
                                                [list[i], list[i + step]] = [list[i + step], list[i]];
                                                patch({ sections: list });
                                            }}
                                        >
                                            {step < 0 ? "版块上移" : "版块下移"}
                                        </Button>
                                    ))}
                                </div>
                                <Field label="版块标题" value={selected.title} max={100} onChange={(title) => patch({ sections: draft.sections.map((s) => (s.id === section ? { ...s, title } : s)) })} />
                                <Field label="版块介绍" value={selected.description} onChange={(description) => patch({ sections: draft.sections.map((s) => (s.id === section ? { ...s, description } : s)) })} multiline />
                                {selected.items.map((item, i) => {
                                    const update = (value: Partial<typeof item>) => patch({ sections: draft.sections.map((s) => (s.id === section ? { ...s, items: s.items.map((v, j) => (j === i ? { ...v, ...value } : v)) } : s)) });
                                    return (
                                        <div className="mc-edit-item" key={i}>
                                            <strong>条目 {i + 1}</strong>
                                            <Field label={`条目 ${i + 1} 标题`} value={item.title} max={100} onChange={(title) => update({ title })} />
                                            <Field label={`条目 ${i + 1} 正文`} value={item.description} max={1500} onChange={(description) => update({ description })} multiline />
                                            <Field label={`条目 ${i + 1} 链接（站内路径或 HTTPS）`} value={item.link} onChange={(link) => update({ link })} />
                                            <MediaEditor value={item.media} onChange={(media) => update({ media })} onError={setError} busy={busy} setBusy={setBusy} />
                                            <Button onClick={() => patch({ sections: draft.sections.map((s) => (s.id === section ? { ...s, items: s.items.filter((_, j) => i !== j) } : s)) })}>移除此条目</Button>
                                        </div>
                                    );
                                })}
                                <Button
                                    disabled={selected.items.length >= 12}
                                    onClick={() => patch({ sections: draft.sections.map((s) => (s.id === section ? { ...s, items: [...s.items, { title: "新条目", description: "", link: "", media: emptyBrandMedia() }] } : s)) })}
                                >
                                    添加条目
                                </Button>
                            </>
                        )}
                    </fieldset>
                    <section className="mc-edit-preview" aria-label="官网实时预览">
                        <div className="mc-edit-preview-bar">
                            <strong>{unpublished ? "草稿预览 · 未发布" : "实时预览 · 与官网一致"}</strong>
                            <Button aria-pressed={!mobile} onClick={() => setMobile(false)}>
                                桌面
                            </Button>
                            <Button aria-pressed={mobile} onClick={() => setMobile(true)}>
                                手机
                            </Button>
                            <Button aria-pressed={fitPreview} onClick={() => setFitPreview(!fitPreview)}>
                                适应宽度
                            </Button>
                        </div>
                        <div ref={previewRef} className="mc-edit-preview-scroll">
                            <div style={{ width: mobile ? 390 : 1100, zoom: fitPreview ? Math.min(1, previewWidth / (mobile ? 390 : 1100)) : 1 }}>
                                <BrandSite content={draft} preview />
                            </div>
                        </div>
                    </section>
                </div>
            )}
            <AppModal
                open={confirmation !== null}
                title={confirmation === "restore" ? "恢复上一发布版本？" : "重新载入草稿？"}
                okText={confirmation === "restore" ? "恢复发布版本" : "放弃修改并载入"}
                cancelText="继续编辑"
                onCancel={() => setConfirmation(null)}
                onOk={() => {
                    const operation = confirmation;
                    setConfirmation(null);
                    if (operation === "restore") void action("restore");
                    else void load();
                }}
            >
                <p>{confirmation === "restore" ? "官网将恢复为上一完整发布版本，编辑草稿保持不变。" : "未保存的修改将丢失，已保存草稿不会改变。"}</p>
            </AppModal>
        </AdminPageFrame>
    );
}
