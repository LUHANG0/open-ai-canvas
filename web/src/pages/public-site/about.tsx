import { Database, Layers3, Server, ShieldCheck } from "lucide-react";
import { useBranding } from "@/components/branding/branding-provider";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { PublicPageIntro, usePublicPageMeta } from "./shared";

export default function PublicAboutPage() {
    const { site } = usePublicSite();
    const { branding } = useBranding();
    usePublicPageMeta(site.config.seo.aboutTitle, site.config.sections.aboutDescription);
    return (
        <main className="public-site-main public-inner-page" id="main-content">
            <PublicPageIntro eyebrow="ABOUT THE STUDIO" count="03" title={site.config.sections.aboutTitle} description={site.config.sections.aboutDescription} />
            <section className="public-about-statement">
                <p>我们相信，好的创作工具应该让创作者更接近自己的故事。</p>
                <h2>它应该理解故事，记住角色，组织镜头，并把每一次生成变成可继续使用的生产资料。</h2>
            </section>
            <section className="public-values-grid">
                <article>
                    <Layers3 aria-hidden="true" />
                    <span>01</span>
                    <h3>围绕作品组织创作</h3>
                    <p>模型会更新，作品的上下文与生产流程必须被长期保存。</p>
                </article>
                <article>
                    <Database aria-hidden="true" />
                    <span>02</span>
                    <h3>让数据回到创作者手里</h3>
                    <p>支持本地部署与自有存储，项目、资产和设置都可自主掌握。</p>
                </article>
                <article>
                    <ShieldCheck aria-hidden="true" />
                    <span>03</span>
                    <h3>每一步都能追踪</h3>
                    <p>任务、版本、渠道与操作记录构成一条可复盘的制作链路。</p>
                </article>
            </section>
            <section className="public-deployment" id="deployment">
                <div>
                    <span className="public-section-eyebrow">DEPLOYMENT</span>
                    <h2>
                        从一台本地机器，
                        <br />
                        到团队创作平台。
                    </h2>
                    <p>{branding.config.identity.displayName}支持本地运行与团队部署。将故事、素材与生成任务放在自己的创作空间，按制作需要配置模型与存储。</p>
                </div>
                <div className="public-deployment-card">
                    <Server aria-hidden="true" />
                    <small>DATA OWNERSHIP</small>
                    <strong>数据自主 · 可部署 · 可扩展</strong>
                    <ul>
                        <li>集中管理项目与创作素材</li>
                        <li>在自己的环境保存创作资料</li>
                        <li>按镜头需要选择模型渠道</li>
                        <li>通过插件扩展创作能力</li>
                    </ul>
                </div>
            </section>
        </main>
    );
}
