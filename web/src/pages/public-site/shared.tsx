import { Modal } from "antd";
import { ArrowUpRight, Expand, Film, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PublicSiteShowcaseItem } from "@/services/api/public-site";
import { useBranding } from "@/components/branding/branding-provider";

export const productionStages = [
    { index: "01", title: "整理故事", english: "STORY", description: "导入小说、粘贴正文或从一句话开始，建立章节结构。" },
    { index: "02", title: "确认资产", english: "ASSETS", description: "把角色、场景、服饰、道具和声音整理成可复用资产。" },
    { index: "03", title: "分镜脚本", english: "SHOT", description: "拆解镜头、构图、动作、台词、时长与资产引用。" },
    { index: "04", title: "动作预演", english: "PREVIS", description: "先验证表演和镜头连续性，再进入正式视频生成。" },
    { index: "05", title: "视频生成", english: "GENERATE", description: "按镜头选择模型、规格与参考，任务在后台持续运行。" },
    { index: "06", title: "成片交付", english: "DELIVER", description: "选择镜头版本，整理视频、字幕、清单和生产资料。" },
] as const;

export function usePublicPageMeta(title: string, description: string) {
    const { branding } = useBranding();
    const name = branding.config.identity.displayName;
    useEffect(() => {
        let disposed = false;
        const previousTitle = document.title;
        const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        const previousDescription = meta?.content ?? "";
        // Apply after the branding provider so its refresh cannot replace route-specific metadata.
        queueMicrotask(() => {
            if (disposed) return;
            document.title = title.replaceAll("影策", name);
            if (meta) meta.content = description.replaceAll("影策", name);
        });
        return () => {
            disposed = true;
            document.title = previousTitle;
            if (meta) meta.content = previousDescription;
        };
    }, [description, title, name, branding.revision]);
}

export function ShowcaseCard({ item, index, large = false }: { item: PublicSiteShowcaseItem; index: number; large?: boolean }) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const [videoFailed, setVideoFailed] = useState(false);
    useEffect(() => {
        setImageFailed(false);
        setVideoFailed(false);
        setOpen(false);
    }, [item.coverUrl, item.videoUrl]);
    const canPreview = Boolean(item.videoUrl || (item.coverUrl && !imageFailed));
    const visual = (
        <div className="public-showcase-visual">
            {item.coverUrl && !imageFailed ? (
                <img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
            ) : (
                <span className="public-showcase-no-cover">
                    <Film aria-hidden="true" />
                    {item.videoUrl ? "观看影片" : "查看作品"}
                </span>
            )}
            <span className="public-showcase-number">FRAME / {String(index + 1).padStart(2, "0")}</span>
            {canPreview ? <span className="public-showcase-play">{item.videoUrl ? <Play aria-hidden="true" /> : <Expand aria-hidden="true" />}</span> : null}
        </div>
    );
    return (
        <article className={`public-showcase-card${large ? " is-large" : ""}`}>
            {canPreview ? (
                <button
                    ref={triggerRef}
                    type="button"
                    className="public-showcase-trigger"
                    onClick={() => {
                        setVideoFailed(false);
                        setOpen(true);
                    }}
                    aria-label={`${item.videoUrl ? "播放" : "放大查看"}${item.title}`}
                >
                    {visual}
                </button>
            ) : item.externalUrl ? (
                <a href={item.externalUrl} target="_blank" rel="noreferrer" aria-label={`${item.title}（在新窗口打开）`}>
                    {visual}
                </a>
            ) : (
                visual
            )}
            <div className="public-showcase-copy">
                <span>{item.category || "创作作品"}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                {item.externalUrl ? (
                    <a href={item.externalUrl} target="_blank" rel="noreferrer">
                        打开完整作品
                        <ArrowUpRight aria-hidden="true" />
                    </a>
                ) : null}
            </div>
            <Modal title={item.title} open={open} onCancel={() => setOpen(false)} afterClose={() => triggerRef.current?.focus()} footer={null} width={1040} centered destroyOnHidden className="public-media-dialog">
                {open ? (
                    item.videoUrl && !videoFailed ? (
                        <video className="public-media-dialog-media" src={item.videoUrl} poster={imageFailed ? undefined : item.coverUrl || undefined} controls playsInline autoPlay onError={() => setVideoFailed(true)} />
                    ) : item.coverUrl && !imageFailed ? (
                        <img className="public-media-dialog-media" src={item.coverUrl} alt={item.title} onError={() => setImageFailed(true)} />
                    ) : (
                        <p role="status">暂时无法加载这段内容。</p>
                    )
                ) : null}
                {videoFailed ? (
                    <p role="status" className="public-media-dialog-note">
                        视频暂时无法播放，请稍后重试。
                        {item.externalUrl ? (
                            <a href={item.externalUrl} target="_blank" rel="noreferrer">
                                打开原作品
                            </a>
                        ) : null}
                    </p>
                ) : null}
                <p className="public-media-dialog-note">
                    {item.description}
                    {item.id.startsWith("brand-concept-") ? " · AI 品牌概念视觉，非产品实测输出。" : ""}
                </p>
            </Modal>
        </article>
    );
}

export function PublicPageIntro({ eyebrow, title, description, count }: { eyebrow: string; title: string; description: string; count: string }) {
    return (
        <section className="public-page-intro">
            <div className="public-page-intro-index">{count}</div>
            <div>
                <span className="public-section-eyebrow">{eyebrow}</span>
                <h1>{title}</h1>
                <p>{description}</p>
            </div>
        </section>
    );
}
