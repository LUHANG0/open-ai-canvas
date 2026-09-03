import { ArrowUpRight, Play } from "lucide-react";
import { useEffect } from "react";

import type { PublicSiteShowcaseItem } from "@/services/api/public-site";

export const productionStages = [
    { index: "01", title: "整理故事", english: "STORY", description: "导入小说、粘贴正文或从一句话开始，建立章节结构。" },
    { index: "02", title: "确认资产", english: "ASSETS", description: "把角色、场景、服饰、道具和声音整理成可复用资产。" },
    { index: "03", title: "分镜脚本", english: "SHOT", description: "拆解镜头、构图、动作、台词、时长与资产引用。" },
    { index: "04", title: "动作预演", english: "PREVIS", description: "先验证表演和镜头连续性，再进入正式视频生成。" },
    { index: "05", title: "视频生成", english: "GENERATE", description: "按镜头选择模型、规格与参考，任务在后台持续运行。" },
    { index: "06", title: "成片交付", english: "DELIVER", description: "选择镜头版本，整理视频、字幕、清单和生产资料。" },
] as const;

export function usePublicPageMeta(title: string, description: string) {
    useEffect(() => {
        const previousTitle = document.title;
        const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        const previousDescription = meta?.content ?? "";
        document.title = title;
        if (meta) meta.content = description;
        return () => {
            document.title = previousTitle;
            if (meta) meta.content = previousDescription;
        };
    }, [description, title]);
}

export function ShowcaseCard({ item, index, large = false }: { item: PublicSiteShowcaseItem; index: number; large?: boolean }) {
    const content = (
        <article className={`public-showcase-card${large ? " is-large" : ""}`}>
            <div className={`public-showcase-visual visual-${(index % 3) + 1}`}>
                {item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
                {item.videoUrl ? (
                    <span className="public-showcase-play">
                        <Play aria-hidden="true" />
                    </span>
                ) : null}
                <span className="public-showcase-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="public-showcase-synthetic" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </div>
            </div>
            <div className="public-showcase-copy">
                <span>{item.category || "YINGCE STUDIO"}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                {item.externalUrl ? <ArrowUpRight aria-hidden="true" /> : null}
            </div>
        </article>
    );
    return item.externalUrl ? (
        <a className="public-showcase-link" href={item.externalUrl} target="_blank" rel="noreferrer">
            {content}
        </a>
    ) : (
        content
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
