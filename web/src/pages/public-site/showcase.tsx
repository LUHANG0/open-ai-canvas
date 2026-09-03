import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { PublicPageIntro, ShowcaseCard, usePublicPageMeta } from "./shared";

export default function PublicShowcasePage() {
    const { site } = usePublicSite();
    usePublicPageMeta(site.config.seo.showcaseTitle, site.config.sections.showcaseDescription);
    return (
        <main className="public-site-main public-inner-page">
            <PublicPageIntro eyebrow="SELECTED WORK" count="02" title={site.config.sections.showcaseTitle} description={site.config.sections.showcaseDescription} />
            <section className="public-showcase-catalog">
                <div className="public-catalog-note">
                    <span>CURATED BY YINGCE</span>
                    <p>公开案例由后台“官网内容”统一维护，可配置封面、视频与 B 站等外部作品链接。</p>
                </div>
                <div className="public-showcase-grid is-catalog">
                    {site.config.showcases.map((item, index) => (
                        <ShowcaseCard key={item.id} item={item} index={index} large={index % 5 === 0} />
                    ))}
                </div>
            </section>
            <section className="public-inline-cta">
                <div>
                    <small>YOUR STORY NEXT</small>
                    <h2>在这里制作你的下一部作品。</h2>
                </div>
                <Link to="/login?next=%2Fcreate" className="public-button is-dark">
                    进入创作台
                    <ArrowRight aria-hidden="true" />
                </Link>
            </section>
        </main>
    );
}
