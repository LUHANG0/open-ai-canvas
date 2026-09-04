import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { useUserStore } from "@/stores/use-user-store";
import { publicEntryLabel } from "@/lib/public-site-content";
import { PublicPageIntro, ShowcaseCard, usePublicPageMeta } from "./shared";

export default function PublicShowcasePage() {
    const { site } = usePublicSite();
    const user = useUserStore((state) => state.user);
    const appHref = user ? "/create" : "/login?next=%2Fcreate";
    const showcases = site.config.showcases;
    const conceptOnly = showcases.length > 0 && showcases.every((item) => item.id.startsWith("brand-concept-"));
    usePublicPageMeta(site.config.seo.showcaseTitle, site.config.sections.showcaseDescription);
    return (
        <main className="public-site-main public-inner-page" id="main-content">
            <PublicPageIntro
                eyebrow="SELECTED FRAMES"
                count="02"
                title={conceptOnly ? "最后一班。\n三个画面，一个故事。" : site.config.sections.showcaseTitle}
                description={conceptOnly ? "暮色里的山中站台、等待的旅人、驶向薄雾的列车。从环境到人物，再到故事的下一幕。" : site.config.sections.showcaseDescription}
            />
            <section className="public-showcase-catalog">
                <div className="public-catalog-note">
                    <span>{conceptOnly ? "A VISUAL STORY / 001" : "SELECTED WORK"}</span>
                    <p>{conceptOnly ? "AI 辅助制作的品牌概念视觉，用于展示叙事方向，并非客户案例或本平台生成效果实测。点击画面查看完整构图。" : "从故事的第一帧，到镜头的最终表达。点击画面，展开创作细节。"}</p>
                </div>
                <div className="public-showcase-grid is-catalog">
                    {!showcases.length ? <p>新的创作即将呈现，敬请期待。</p> : null}
                    {showcases.map((item, index) => (
                        <ShowcaseCard key={item.id} item={item} index={index} large={index % 5 === 0} />
                    ))}
                </div>
            </section>
            <section className="public-inline-cta">
                <div>
                    <small>YOUR STORY NEXT</small>
                    <h2>在这里制作你的下一部作品。</h2>
                </div>
                <Link to={appHref} className="public-button is-dark">
                    {publicEntryLabel(Boolean(user))}
                    <ArrowRight aria-hidden="true" />
                </Link>
            </section>
        </main>
    );
}
