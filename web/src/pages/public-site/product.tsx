import { ArrowRight, Bot, Cloud, FolderKanban, Layers3, MonitorPlay, Network } from "lucide-react";
import { Link } from "react-router";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { useUserStore } from "@/stores/use-user-store";
import { BRAND_CONCEPT_SHOWCASES, publicEntryLabel } from "@/lib/public-site-content";
import { productionStages, PublicPageIntro, usePublicPageMeta } from "./shared";

const capabilities = [
    {
        icon: Bot,
        eyebrow: "CONVERSATION",
        title: "带着故事继续聊，\n让灵感接着往前走。",
        text: "创作对话跟随账号与项目同步，保留故事背景、版本与后续任务，让灵感能够继续生产。",
        bullets: ["项目级对话云同步", "上下文与创作资产关联", "可扩展 Agent 与技能"],
    },
    {
        icon: FolderKanban,
        eyebrow: "PRODUCTION",
        title: "从章节到镜头，\n按真实生产环节推进。",
        text: "角色、场景、分镜、动作预演、视频生成与交付形成清晰阶段，团队知道下一步该做什么。",
        bullets: ["六阶段短剧工作流", "镜头级资产引用", "后台任务与版本选择"],
    },
    { icon: Network, eyebrow: "DIRECTOR CANVAS", title: "把想法摊开，\n在画布上看见关系。", text: "自由编排参考图、提示词、生成节点与结果，也能从项目镜头直接进入导演台继续打磨。", bullets: ["无限画布编排", "节点式生成流程", "结果回写项目资产"] },
    { icon: Cloud, eyebrow: "SYSTEM", title: "可以上云，\n也保留数据自主。", text: "支持本地部署、多设备同步、模型渠道配置与资源管理，让创作能力属于自己的生产系统。", bullets: ["本地与私有化部署", "统一资源与任务中心", "多模型渠道接入"] },
] as const;

export default function PublicProductPage() {
    const { site } = usePublicSite();
    const user = useUserStore((state) => state.user);
    const appHref = user ? "/create" : "/login?next=%2Fcreate";
    usePublicPageMeta(site.config.seo.productTitle, site.config.sections.productDescription);
    return (
        <main className="public-site-main public-inner-page" id="main-content">
            <PublicPageIntro eyebrow="THE PRODUCT" count="01" title={site.config.sections.productTitle} description={site.config.sections.productDescription} />
            <section className="public-product-manifesto">
                <div>
                    <Layers3 aria-hidden="true" />
                    <strong>一个项目上下文</strong>
                    <span>故事、资产、镜头、任务始终相连</span>
                </div>
                <div>
                    <MonitorPlay aria-hidden="true" />
                    <strong>一条连续生产线</strong>
                    <span>从构想到交付不必反复搬运</span>
                </div>
                <div>
                    <Cloud aria-hidden="true" />
                    <strong>一套可持续系统</strong>
                    <span>同步、部署、扩展都由你决定</span>
                </div>
            </section>
            <section className="public-capability-list">
                {capabilities.map(({ icon: Icon, ...item }, index) => (
                    <article key={item.eyebrow}>
                        <div className="public-capability-index">
                            <span>0{index + 1}</span>
                            <Icon aria-hidden="true" />
                        </div>
                        <div className="public-capability-copy">
                            <small>{item.eyebrow}</small>
                            <h2>{item.title}</h2>
                            <p>{item.text}</p>
                            <ul>
                                {item.bullets.map((bullet) => (
                                    <li key={bullet}>{bullet}</li>
                                ))}
                            </ul>
                        </div>
                        <figure className="public-capability-visual">
                            <img
                                src={index === 2 ? "/brand/workspace-canvas.webp" : BRAND_CONCEPT_SHOWCASES[index % 3].coverUrl}
                                alt={index === 2 ? "真实画布界面：连接故事、镜头提示、参考图片和生成配置，使用演示数据" : ["暮色中的山中站台", "旅人的服装与车票细节", "列车驶入山谷"][index % 3]}
                                loading="lazy"
                            />
                            <figcaption>{index === 2 ? "真实画布界面 · 演示数据" : `${["故事起点 · 明确情绪与叙事", "角色参考 · 组织服装与人物细节", "", "素材管理 · 保留可继续使用的创作参考"][index]} / 品牌概念视觉`}</figcaption>
                            {index === 2 ? (
                                <a className="public-text-link" href="/brand/workspace-canvas.webp" target="_blank" rel="noreferrer">
                                    查看完整界面
                                    <ArrowRight aria-hidden="true" />
                                </a>
                            ) : null}
                        </figure>
                    </article>
                ))}
            </section>
            <section className="public-stage-detail">
                <header>
                    <span className="public-section-eyebrow">PRODUCTION MAP</span>
                    <h2>{site.config.sections.workflowTitle}</h2>
                </header>
                <div>
                    {productionStages.map((stage) => (
                        <article key={stage.index}>
                            <span>{stage.index}</span>
                            <small>{stage.english}</small>
                            <h3>{stage.title}</h3>
                            <p>{stage.description}</p>
                        </article>
                    ))}
                </div>
            </section>
            <section className="public-inline-cta">
                <div>
                    <small>START A PROJECT</small>
                    <h2>让创意进入生产。</h2>
                </div>
                <Link to={appHref} className="public-button is-dark">
                    {publicEntryLabel(Boolean(user))}
                    <ArrowRight aria-hidden="true" />
                </Link>
            </section>
        </main>
    );
}
