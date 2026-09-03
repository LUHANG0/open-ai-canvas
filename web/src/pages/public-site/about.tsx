import { ArrowUpRight, Database, GitFork, Layers3, Server, ShieldCheck } from "lucide-react";
import { useBranding } from "@/components/branding/branding-provider";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { PublicPageIntro, usePublicPageMeta } from "./shared";

export default function PublicAboutPage() {
    const { site } = usePublicSite();
    const { branding } = useBranding();
    usePublicPageMeta(site.config.seo.aboutTitle, site.config.sections.aboutDescription);
    return (
        <main className="public-site-main public-inner-page">
            <PublicPageIntro eyebrow="ABOUT YINGCE" count="03" title={site.config.sections.aboutTitle} description={site.config.sections.aboutDescription} />
            <section className="public-about-statement">
                <p>我们相信，AI 影视工具不该只是一个会生成画面的输入框。</p>
                <h2>它应该理解故事，记住角色，组织镜头，并把每一次生成变成可继续使用的生产资料。</h2>
            </section>
            <section className="public-values-grid">
                <article>
                    <Layers3 aria-hidden="true" />
                    <span>01</span>
                    <h3>围绕作品，而不是模型</h3>
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
                    <p>影策支持本地运行与服务化部署。站点品牌、官网内容、登录页、模型渠道和存储策略都可以独立配置。</p>
                </div>
                <div className="public-deployment-card">
                    <Server aria-hidden="true" />
                    <small>DATA OWNERSHIP</small>
                    <strong>数据自主 · 可部署 · 可扩展</strong>
                    <ul>
                        <li>配置与业务数据分离管理</li>
                        <li>官网草稿预览后再发布</li>
                        <li>管理操作保留修订与审计</li>
                        <li>多模型和插件式能力接入</li>
                    </ul>
                </div>
            </section>
            <section className="public-open-source">
                <GitFork aria-hidden="true" />
                <div>
                    <small>OPEN SOURCE</small>
                    <h2>{branding.config.identity.displayName} 持续开放演进。</h2>
                    <p>查看代码、部署自己的创作工作台，或参与产品能力建设。</p>
                </div>
                {site.config.links.repositoryUrl ? (
                    <a href={site.config.links.repositoryUrl} target="_blank" rel="noreferrer">
                        访问 GitHub
                        <ArrowUpRight aria-hidden="true" />
                    </a>
                ) : null}
            </section>
        </main>
    );
}
