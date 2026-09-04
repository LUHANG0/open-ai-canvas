import { ArrowDown, ArrowRight, Boxes, Check, Film, Layers3, Pause, Play, ScanLine } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useBranding } from "@/components/branding/branding-provider";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { BRAND_CONCEPT_POSTER, BRAND_CONCEPT_SHOWCASES, publicEntryLabel } from "@/lib/public-site-content";
import { useUserStore } from "@/stores/use-user-store";
import { ShowcaseCard, usePublicPageMeta } from "./shared";

const benefits = [
    { icon: Layers3, title: "故事始终在场", text: "章节、角色和镜头放在同一项目里，每次继续创作，都有上下文可循。" },
    { icon: Boxes, title: "好资产，接着用", text: "将角色、场景和参考沉淀为资产，在后续镜头中反复引用。" },
    { icon: ScanLine, title: "把选择留给创作者", text: "按镜头选择模型、组织参考、比较结果，在画布上打磨自己的表达。" },
];
const storySteps = [
    { title: "一句故事", label: "STORY", body: "末班车即将离站，一个旅人带着未寄出的信，回到山里的旧站台。" },
    { title: "一个角色", label: "CHARACTER", body: "旅人 · 深色外套、旧车票。用统一的设定组织角色参考。" },
    { title: "一组镜头", label: "STORYBOARD", body: "远景交代站台，中景跟随旅人，特写落在车票，远景目送列车。" },
    { title: "一次打磨", label: "PRODUCTION", body: "为各个镜头组织参考与提示，选择模型，比较生成版本。" },
];

export default function PublicHomePage() {
    const { site } = usePublicSite();
    const { branding } = useBranding();
    const user = useUserStore((state) => state.user);
    const reducedMotion = useReducedMotion();
    const desktop = usePcBrandViewport();
    const [videoFailed, setVideoFailed] = useState(false);
    const [paused, setPaused] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const hero = site.config.hero;
    const mediaUrl = hero.showreelUrl;
    const posterUrl = hero.posterUrl || BRAND_CONCEPT_POSTER;
    const showVideo = Boolean(mediaUrl && desktop && !reducedMotion && !videoFailed);
    const appHref = user ? "/create" : "/login?next=%2Fcreate";
    const showcases = site.config.showcases.slice(0, 3);
    const conceptOnly = showcases.length > 0 && showcases.every((item) => item.id.startsWith("brand-concept-"));
    const reveal = reducedMotion ? {} : { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.08 }, transition: { duration: 0.5 } };

    useEffect(() => {
        setVideoFailed(false);
        setPaused(false);
    }, [mediaUrl]);
    usePublicPageMeta(site.config.seo.homeTitle, site.config.seo.homeDescription);
    const togglePlayback = async () => {
        const video = videoRef.current;
        if (!video) return;
        if (!video.paused) {
            video.pause();
            setPaused(true);
            return;
        }
        try {
            await video.play();
            setPaused(false);
        } catch {
            setVideoFailed(true);
        }
    };

    return (
        <main className="public-site-main" id="main-content">
            <motion.section className="public-hero" initial={false} animate="visible">
                <div className="public-hero-media">
                    <img
                        className="public-hero-poster"
                        src={posterUrl}
                        alt=""
                        fetchPriority="high"
                        onError={(event) => {
                            if (!event.currentTarget.src.endsWith(BRAND_CONCEPT_POSTER)) event.currentTarget.src = BRAND_CONCEPT_POSTER;
                        }}
                    />
                    {showVideo ? <video ref={videoRef} src={mediaUrl} poster={posterUrl} autoPlay loop muted playsInline onPause={() => setPaused(true)} onPlay={() => setPaused(false)} onError={() => setVideoFailed(true)} /> : null}
                    <div className="public-hero-gradient" />
                </div>
                <motion.div className="public-hero-content" initial={reducedMotion ? false : "hidden"} animate="visible" variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, staggerChildren: 0.06 } } }}>
                    <span className="public-section-eyebrow">
                        <i /> {branding.config.identity.displayName} · {hero.eyebrow}
                    </span>
                    <h1>{hero.title}</h1>
                    <p>
                        从脑海里的一个故事，
                        <br className="public-mobile-break" />
                        到值得被看见的画面。
                    </p>
                    <p className="public-hero-description">{hero.description}</p>
                    <div className="public-hero-actions">
                        <Link to={appHref} className="public-button is-light">
                            {publicEntryLabel(Boolean(user))}
                            <ArrowRight aria-hidden="true" />
                        </Link>
                        <a href="#selected-work" className="public-button is-ghost">
                            {hero.secondaryCta}
                            <ArrowDown aria-hidden="true" />
                        </a>
                    </div>
                    {!user ? <span className="public-entry-note">邀请体验中 · 使用团队发来的邀请链接加入</span> : null}
                </motion.div>
                <div className="public-hero-bottom">
                    <a href="#selected-work" className="public-hero-scroll">
                        <ArrowDown aria-hidden="true" /> 向下，进入故事
                    </a>
                    <div className="public-hero-caption">
                        <span>{mediaUrl || hero.posterUrl ? hero.showreelLabel : "《最后一班》 / 品牌概念视觉"}</span>
                        <small>STORIES START HERE</small>
                    </div>
                    {showVideo ? (
                        <button type="button" className="public-media-toggle" onClick={() => void togglePlayback()} aria-label={paused ? "播放背景视频" : "暂停背景视频"}>
                            {paused ? <Play /> : <Pause />}
                        </button>
                    ) : null}
                </div>
            </motion.section>
            <div className="public-production-rail" aria-label="创作环节">
                <span>从灵感到镜头</span>
                <b>故事</b>
                <i />
                <b>角色</b>
                <i />
                <b>分镜</b>
                <i />
                <b>生成</b>
                <i />
                <b>打磨</b>
                <span>ONE CREATIVE SPACE</span>
            </div>
            <motion.section className="public-section public-showcase-section" id="selected-work" {...reveal}>
                <header className="public-section-heading">
                    <div>
                        <span className="public-section-eyebrow">01 / SELECTED FRAMES</span>
                        <h2>
                            {conceptOnly ? (
                                <>
                                    每个画面，
                                    <br />
                                    都可以是故事的开始。
                                </>
                            ) : (
                                site.config.sections.showcaseTitle
                            )}
                        </h2>
                    </div>
                    <div>
                        <p>{conceptOnly ? "以《最后一班》为题，探索场景、人物与镜头之间的叙事。" : site.config.sections.showcaseDescription}</p>
                        <Link className="public-text-link" to="/showcase">
                            {conceptOnly ? "展开这组视觉" : "浏览全部作品"}
                            <ArrowRight aria-hidden="true" />
                        </Link>
                    </div>
                </header>
                <div className="public-showcase-grid">
                    {!showcases.length ? <p>新的创作即将呈现，敬请期待。</p> : null}
                    {showcases.map((item, index) => (
                        <ShowcaseCard key={item.id} item={item} index={index} large={index === 0} />
                    ))}
                </div>
                {conceptOnly ? <p className="public-media-disclosure">本组图片为 AI 辅助制作的品牌概念视觉，用于展示叙事方向；并非客户案例或本平台生成效果实测。</p> : null}
            </motion.section>
            <motion.section className="public-section public-product-section" id="product" {...reveal}>
                <header className="public-section-heading">
                    <div>
                        <span className="public-section-eyebrow">02 / YOUR CREATIVE WORKSPACE</span>
                        <h2>{site.config.sections.productTitle}</h2>
                    </div>
                    <div>
                        <p>{site.config.sections.productDescription}</p>
                        <Link className="public-text-link" to="/product">
                            走进创作工作台
                            <ArrowRight aria-hidden="true" />
                        </Link>
                    </div>
                </header>
                <div className="public-workspace-preview">
                    <div className="public-preview-toolbar">
                        <span>
                            <Film aria-hidden="true" /> 最后一班
                        </span>
                        <span>故事 / 分镜规划</span>
                        <span className="public-preview-tag">工作流示意</span>
                    </div>
                    <div className="public-preview-body">
                        <aside>
                            <span>项目资产</span>
                            <strong>最后一班</strong>
                            <p>01 故事大纲</p>
                            <p>02 角色设定</p>
                            <p className="is-active">03 镜头规划</p>
                            <p>04 生成版本</p>
                            <small>
                                让每个镜头
                                <br />
                                都有故事可循。
                            </small>
                        </aside>
                        <div className="public-preview-board">
                            <div className="public-preview-note">
                                <span>STORY NOTE / 01</span>
                                <strong>在最后一班车开走之前。</strong>
                                <p>旅人回到旧站台。镜头从山谷切入，再落到掌心里的车票。</p>
                            </div>
                            <div className="public-preview-shots">
                                {BRAND_CONCEPT_SHOWCASES.map((item, index) => (
                                    <div key={item.id}>
                                        <img src={item.coverUrl} alt="" loading="lazy" />
                                        <span>
                                            镜头 0{index + 1}
                                            <small>{["远景 · 站台", "中景 · 旅人", "远景 · 出发"][index]}</small>
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="public-preview-reference">
                                <span>
                                    <Check aria-hidden="true" /> 角色参考
                                </span>
                                <span>
                                    <Check aria-hidden="true" /> 场景设定
                                </span>
                                <span>
                                    <Check aria-hidden="true" /> 镜头提示
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="public-media-disclosure">创作流程示意 · 概念素材用于说明组织方式，实际界面以产品为准。</p>
                <div className="public-benefits">
                    {benefits.map(({ icon: Icon, title, text }) => (
                        <article key={title}>
                            <Icon aria-hidden="true" />
                            <h3>{title}</h3>
                            <p>{text}</p>
                        </article>
                    ))}
                </div>
            </motion.section>
            <motion.section className="public-section public-story-section" {...reveal}>
                <header className="public-section-heading">
                    <div>
                        <span className="public-section-eyebrow">03 / FROM A SINGLE IDEA</span>
                        <h2>{site.config.sections.workflowTitle}</h2>
                    </div>
                    <p>{site.config.sections.workflowDescription}</p>
                </header>
                <div className="public-story-grid">
                    {storySteps.map((step, index) => (
                        <motion.article key={step.label} whileHover={reducedMotion ? undefined : { y: -3 }}>
                            <span>
                                0{index + 1}
                                <small>{step.label}</small>
                            </span>
                            <h3>{step.title}</h3>
                            <p>{step.body}</p>
                        </motion.article>
                    ))}
                </div>
            </motion.section>
            <motion.section className="public-section public-audience-section" {...reveal}>
                <span className="public-section-eyebrow">BUILT AROUND YOUR STORY</span>
                <h2>
                    给独立创作者的空间。
                    <br />
                    给小型制作团队的秩序。
                </h2>
                <p>从第一个短片，到一部连续短剧。让创意留在作品里，让制作过程清晰可循。</p>
                <div>
                    <span>AI 短剧</span>
                    <span>叙事短片</span>
                    <span>视觉概念</span>
                    <span>镜头预演</span>
                </div>
            </motion.section>
            <section className="public-section public-faq-section" id="experience">
                <div>
                    <span className="public-section-eyebrow">BEFORE THE FIRST TAKE</span>
                    <h2>开始之前。</h2>
                </div>
                <div className="public-faq-list">
                    <details>
                        <summary>现在如何体验？</summary>
                        <p>目前采用邀请制。收到团队发来的邀请链接后，可按页面指引创建账号；已有账号可直接登录。暂未开放自助申请。</p>
                    </details>
                    <details>
                        <summary>这些图片是产品实测输出吗？</summary>
                        <p>《最后一班》是为官网制作的 AI 品牌概念视觉，用来说明故事与镜头的组织方式，并非本平台实测输出或客户案例。实际生成效果取决于模型、输入和创作设置。</p>
                    </details>
                    <details>
                        <summary>可以使用自己的模型和素材吗？</summary>
                        <p>本平台支持素材管理和多模型渠道配置。具体可用模型与功能由所在团队的设置决定。</p>
                    </details>
                    <details>
                        <summary>手机也可以访问吗？</summary>
                        <p>可以用手机浏览官网。涉及复杂画布与镜头编排时，建议在电脑的大屏幕上创作。</p>
                    </details>
                </div>
            </section>
            <motion.section className="public-final-cta" {...reveal}>
                <span className="public-section-eyebrow">YOUR NEXT STORY</span>
                <h2>
                    下一部作品，
                    <br />
                    从这里开机。
                </h2>
                <div>
                    <Link to={appHref} className="public-button is-light">
                        {publicEntryLabel(Boolean(user))}
                        <ArrowRight aria-hidden="true" />
                    </Link>
                    {site.config.links.contactUrl ? (
                        <a href={site.config.links.contactUrl} className="public-text-link">
                            联系团队
                            <ArrowRight aria-hidden="true" />
                        </a>
                    ) : (
                        <a href="#experience" className="public-text-link">
                            了解邀请体验
                            <ArrowRight aria-hidden="true" />
                        </a>
                    )}
                </div>
                <p>{branding.config.identity.displayName} · 让故事开机</p>
            </motion.section>
        </main>
    );
}
