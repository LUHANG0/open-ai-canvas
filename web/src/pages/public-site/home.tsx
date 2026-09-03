import { ArrowRight, Boxes, Cloud, Film, GitBranch, LayoutDashboard, MessageSquareText, Play, Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";

import { useBranding } from "@/components/branding/branding-provider";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { useUserStore } from "@/stores/use-user-store";

import { productionStages, ShowcaseCard, usePublicPageMeta } from "./shared";

const productCards = [
    { icon: MessageSquareText, label: "CREATIVE ROOM", title: "创作对话", text: "围绕当前故事、章节与项目连续创作，灵感不再遗失在一次性对话里。" },
    { icon: Film, label: "PRODUCTION", title: "短剧生产线", text: "角色、场景、分镜、预演与视频任务沿着同一条项目脉络推进。" },
    { icon: LayoutDashboard, label: "DIRECTOR CANVAS", title: "导演台与画布", text: "把参考素材、提示词、镜头版本和生成结果放进可视化空间。" },
    { icon: Boxes, label: "ASSET SYSTEM", title: "资产与交付", text: "将角色、声音、场景和成片版本沉淀为可复用、可追踪的生产资产。" },
] as const;

export default function PublicHomePage() {
    const { site } = usePublicSite();
    const { branding } = useBranding();
    const user = useUserStore((state) => state.user);
    const reducedMotion = useReducedMotion();
    const desktop = usePcBrandViewport();
    const [videoFailed, setVideoFailed] = useState(false);
    const hero = site.config.hero;
    const mediaUrl = hero.showreelUrl || branding.assets.authHeroUrl;
    const posterUrl = hero.posterUrl || branding.assets.authHeroPosterUrl;
    const showVideo = Boolean(mediaUrl && desktop && !reducedMotion && !videoFailed);
    const appHref = user ? "/create" : "/login?next=%2Fcreate";

    usePublicPageMeta(site.config.seo.homeTitle, site.config.seo.homeDescription);

    return (
        <main className="public-site-main">
            <section className="public-hero">
                <div className="public-hero-media" style={posterUrl ? { backgroundImage: `url(${posterUrl})` } : undefined}>
                    {showVideo ? <video src={mediaUrl} poster={posterUrl || undefined} autoPlay loop muted playsInline onError={() => setVideoFailed(true)} /> : null}
                    <div className="public-hero-gradient" />
                    <div className="public-film-grain" />
                </div>
                <div className="public-hero-content">
                    <span className="public-section-eyebrow">{hero.eyebrow}</span>
                    <h1>{hero.title}</h1>
                    <p>{hero.description}</p>
                    <div className="public-hero-actions">
                        <Link to={appHref} className="public-button is-light">
                            {user ? "进入工作台" : hero.primaryCta}
                            <ArrowRight aria-hidden="true" />
                        </Link>
                        <Link to="/showcase" className="public-button is-ghost">
                            <Play aria-hidden="true" />
                            {hero.secondaryCta}
                        </Link>
                    </div>
                </div>
                <div className="public-hero-reel">
                    <span>{hero.showreelLabel}</span>
                    <i />
                </div>
                <a href="#product" className="public-hero-scroll" aria-label="继续浏览">
                    <span>SCROLL</span>
                    <i />
                </a>
            </section>

            <section className="public-production-rail" aria-label="影视生产流程">
                {productionStages.map((stage) => (
                    <span key={stage.index}>
                        <b>{stage.index}</b>
                        {stage.english}
                    </span>
                ))}
            </section>

            <section className="public-section public-product-section" id="product">
                <header className="public-section-heading">
                    <span className="public-section-eyebrow">01 / THE PRODUCT</span>
                    <h2>{site.config.sections.productTitle}</h2>
                    <p>{site.config.sections.productDescription}</p>
                </header>
                <div className="public-product-grid">
                    {productCards.map(({ icon: Icon, ...card }, index) => (
                        <article key={card.title} className={`public-product-card card-${index + 1}`}>
                            <div className="public-product-card-top">
                                <span>{card.label}</span>
                                <Icon aria-hidden="true" />
                            </div>
                            <div className="public-product-miniature" aria-hidden="true">
                                <i />
                                <i />
                                <i />
                                <i />
                            </div>
                            <h3>{card.title}</h3>
                            <p>{card.text}</p>
                        </article>
                    ))}
                </div>
                <Link className="public-text-link" to="/product">
                    查看完整产品能力
                    <ArrowRight aria-hidden="true" />
                </Link>
            </section>

            <section className="public-section public-workflow-section">
                <header className="public-section-heading is-inverted">
                    <span className="public-section-eyebrow">02 / ONE CONTINUOUS FLOW</span>
                    <h2>{site.config.sections.workflowTitle}</h2>
                    <p>{site.config.sections.workflowDescription}</p>
                </header>
                <div className="public-workflow-list">
                    {productionStages.map((stage) => (
                        <article key={stage.index}>
                            <span>{stage.index}</span>
                            <div>
                                <small>{stage.english}</small>
                                <h3>{stage.title}</h3>
                            </div>
                            <p>{stage.description}</p>
                            <ArrowRight aria-hidden="true" />
                        </article>
                    ))}
                </div>
            </section>

            <section className="public-section public-showcase-section">
                <header className="public-section-heading">
                    <span className="public-section-eyebrow">03 / SELECTED WORK</span>
                    <h2>{site.config.sections.showcaseTitle}</h2>
                    <p>{site.config.sections.showcaseDescription}</p>
                </header>
                <div className="public-showcase-grid">
                    {site.config.showcases.slice(0, 3).map((item, index) => (
                        <ShowcaseCard key={item.id} item={item} index={index} large={index === 0} />
                    ))}
                </div>
                <Link className="public-text-link" to="/showcase">
                    浏览全部作品
                    <ArrowRight aria-hidden="true" />
                </Link>
            </section>

            <section className="public-system-band">
                <div>
                    <Cloud aria-hidden="true" />
                    <span>云端同步</span>
                    <p>创作对话、项目状态与资产跨设备连续。</p>
                </div>
                <div>
                    <GitBranch aria-hidden="true" />
                    <span>工作流可追踪</span>
                    <p>每一步都有上下文、版本和任务记录。</p>
                </div>
                <div>
                    <Sparkles aria-hidden="true" />
                    <span>模型可扩展</span>
                    <p>按生产环节接入不同模型与创作 Agent。</p>
                </div>
            </section>

            <section className="public-final-cta">
                <span className="public-section-eyebrow">READY WHEN YOU ARE</span>
                <h2>
                    下一部作品，
                    <br />
                    从这里开机。
                </h2>
                <Link to={appHref} className="public-button is-dark">
                    {user ? "返回工作台" : "免费开始创作"}
                    <ArrowRight aria-hidden="true" />
                </Link>
            </section>
        </main>
    );
}
