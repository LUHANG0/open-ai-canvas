import { Fragment, lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Menu, Plus, X } from "lucide-react";
import { brandStudioLabel, useAppearanceStore } from "@/stores/use-appearance-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { type BrandContent, type BrandSection } from "@/services/api/brand-site";
import { BrandLink } from "./brand-link";
import { BrandLogo } from "./brand-logo";
import { CinemaMedia } from "./cinema-media";
import { BrandInspirationGallery } from "./brand-inspiration-gallery";
import { ReferenceFilm, VIDU_MEDIA } from "./brand-reference-media";
import { AppLoading } from "@/components/ui/app-loading";
import { useHeroReadiness } from "./use-hero-readiness";
import { BrandWorkflowTheater } from "./brand-workflow-theater";
import { BrandProductPreview, PRODUCT_ENTRIES } from "./brand-product-preview";
import "./brand-site.css";

const Lightbox = lazy(() => import("@/components/ui/product/app-modal/app-modal").then((module) => ({ default: module.AppModal })));
const SCENES = [VIDU_MEDIA.sports, VIDU_MEDIA.cinema];
const ARTWORK = [VIDU_MEDIA.cinema, VIDU_MEDIA.character, VIDU_MEDIA.performance];
const CREATION_LINKS = [
    { title: "视频创作", description: "从文字与参考素材开始", href: "/create?mode=video" },
    { title: "图片创作", description: "描绘你想象中的画面", href: "/create?mode=image" },
    { title: "创作画布", description: "组织素材，继续探索", href: "/canvas" },
    { title: "短剧项目", description: "人物、章节与镜头管理", href: "/projects" },
];
type NavigationProps = { onClick?: React.MouseEventHandler<HTMLAnchorElement> };

function CreationLink({ href, children, className, navigation, label }: { href: string; children: React.ReactNode; className?: string; navigation: NavigationProps; label?: string }) {
    const internal = href.startsWith("/") && !href.startsWith("//");
    return <BrandLink className={className} href={internal ? "/login" : href} authNext={internal ? href : undefined} aria-label={label} {...navigation}>{children}</BrandLink>;
}

function Hero({ content, preview, navigation }: { content: BrandContent; preview: boolean; navigation: NavigationProps }) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const [selected, setSelected] = useState(0);
    const [prompt, setPrompt] = useState("");
    const action = useRef<HTMLFormElement>(null);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const target = prompt.trim() ? "/create?mode=video&prompt=" + encodeURIComponent(Array.from(prompt.trim()).slice(0, 2000).join("")) : content.primaryLink;
    const promptId = useId();
    const entry = useHeroReadiness(preview);
    return <section data-entry-ready={entry.ready || undefined} data-entry-timeout={entry.fallback || undefined} className={"mv-hero" + (content.heroMedia.resourceId ? " mv-hero-custom" : "")}>
        {content.heroMedia.resourceId ? <div className="mv-hero-custom-media"><CinemaMedia value={content.heroMedia} preview={preview} priority onReady={entry.onReady} /></div> : <ReferenceFilm key={selected} media={SCENES[selected]} preview={preview} priority onReady={entry.onReady} className="mv-hero-film" />}
        {!entry.ready && <AppLoading brand />}
        <div className="mv-hero-shade" />
        <div className="mv-hero-copy">
            <p className="mv-hero-brand">{appearance.brandName}</p>
            <h1>{content.title.replaceAll("\n", "")}</h1>
            <p className="mv-hero-description">{content.description}</p>
            {content.detail && <p className="mv-hero-detail">{content.detail}</p>}
            <form ref={action} className="mv-prompt" onSubmit={(event) => { event.preventDefault(); if (!preview) action.current?.querySelector("a")?.click(); }}>
                <label className="mv-sr-only" htmlFor={promptId}>描述想创作的画面</label>
                <input id={promptId} value={prompt} maxLength={2000} onChange={(event) => setPrompt(event.target.value)} placeholder={selected === 0 ? "红色烟雾中，运动员抱球奔向镜头…" : "写下你的想象，让下一幕发生…"} autoComplete="off" />
                <BrandLink className="mv-button" href="/login" authNext={target} {...navigation}>去创作<ArrowUpRight aria-hidden="true" /></BrandLink>
            </form>
            {content.secondaryLabel && <p className="mv-hero-secondary">{content.secondaryLabel}</p>}
        </div>
        {!content.heroMedia.resourceId && <div className="mv-scene-switch" role="group" aria-label="选择开场影片">{SCENES.map((scene, index) => <button key={scene.image} ref={(node) => { buttons.current[index] = node; }} type="button" aria-label={"切换开场影片 " + (index + 1)} aria-pressed={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => {
            if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : ["ArrowLeft", "ArrowRight"].includes(event.key) ? 1 - index : null;
            if (next === null) return;
            event.preventDefault(); setSelected(next); buttons.current[next]?.focus();
        }}><span /></button>)}</div>}
        <BrandLink className="mv-scroll" href="#inspiration" aria-label="探索创意影片" {...navigation}><ArrowDown aria-hidden="true" /></BrandLink>
    </section>;
}

function FeatureFilms({ preview, navigation }: { preview: boolean; navigation: NavigationProps }) {
    return <div className="mv-features mv-shell">
        <section className="mv-feature" id="video"><ReferenceFilm media={VIDU_MEDIA.performance} preview={preview} /><div className="mv-feature-shade" /><div className="mv-feature-copy"><p className="mv-product-label">MengCeng <span>Video</span></p><h2>让每一幕，都有表现力</h2><p>描述画面、镜头运动与光线，从灵感开始打磨你的 AI 影像。</p><CreationLink className="mv-button" href="/create?mode=video" navigation={navigation}>立即创作<ArrowUpRight aria-hidden="true" /></CreationLink></div></section>
        <section className="mv-feature" id="creation"><ReferenceFilm media={VIDU_MEDIA.character} preview={preview} /><div className="mv-feature-shade" /><div className="mv-feature-copy"><p className="mv-product-label">MengCeng <span>Studio</span></p><h2>从一个想法，到下一个镜头</h2><p>与 AI 讨论创意，带入参考素材，在对话和画布中继续探索。</p><CreationLink className="mv-button" href="/create" navigation={navigation}>开始探索<ArrowUpRight aria-hidden="true" /></CreationLink></div></section>
    </div>;
}

function PublishedGallery({ section, preview, navigation }: { section: BrandSection; preview: boolean; navigation: NavigationProps }) {
    const [opened, setOpened] = useState<number | null>(null);
    const expanded = opened === null ? undefined : section.items[opened];
    const artwork = (index: number) => ({ src: ARTWORK[index % ARTWORK.length].image, alt: ARTWORK[index % ARTWORK.length].alt });
    useEffect(() => {
        if (!expanded || opened === null) return;
        const key = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target as HTMLElement)?.closest?.("video,input,textarea")) return;
            const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            if (!delta) return;
            event.preventDefault(); setOpened((value) => value === null ? null : (value + delta + section.items.length) % section.items.length);
        };
        document.addEventListener("keydown", key);
        return () => document.removeEventListener("keydown", key);
    }, [opened, expanded, section.items.length]);
    return <section id={section.id} className="mv-section mv-examples mv-shell">
        <header className="mv-heading"><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}</header>
        <div className="mv-gallery">{section.items.map((item, index) => <article key={index}>
            {item.media.resourceId && item.media.kind === "video" ? <figure><CinemaMedia value={item.media} preview={preview} /></figure> : <button type="button" className="mv-gallery-open" aria-label={"放大查看" + item.title} onClick={() => setOpened(index)}><CinemaMedia value={item.media} preview={preview} fallback={artwork(index)} /><span>查看影像<ArrowUpRight aria-hidden="true" /></span></button>}
            <div className="mv-gallery-caption"><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}{item.link && <CreationLink className="mv-text-link" href={item.link} navigation={navigation}>进入{item.title}<ArrowUpRight aria-hidden="true" /></CreationLink>}</div>
        </article>)}</div>
        {expanded && <Suspense fallback={null}><Lightbox open flush centered width={1100} title={expanded.title} footer={null} onCancel={() => setOpened(null)} rootClassName="mv-lightbox"><div className="mv-lightbox-media"><CinemaMedia key={opened} value={expanded.media} preview={preview} fallback={artwork(opened!)} /></div>{section.items.length > 1 && <div className="mv-lightbox-controls"><button type="button" aria-label="上一张影像" onClick={() => setOpened((opened! - 1 + section.items.length) % section.items.length)}><ArrowLeft aria-hidden="true" /></button><span aria-live="polite">{opened! + 1} / {section.items.length}</span><button type="button" aria-label="下一张影像" onClick={() => setOpened((opened! + 1) % section.items.length)}><ArrowRight aria-hidden="true" /></button></div>}</Lightbox></Suspense>}
    </section>;
}

function PublishedSection({ section, content, preview, navigation }: { section: BrandSection; content: BrandContent; preview: boolean; navigation: NavigationProps }) {
    const id = useId();
    const items = section.id === "entries" ? section.items.map((item) => {
        const product = PRODUCT_ENTRIES.find((entry) => entry.legacy === item.title);
        return product ? { ...item, title: product.title, description: item.description || product.description, link: item.link === "/create" ? product.link : item.link } : item;
    }) : section.items;
    if (section.id === "examples") return <PublishedGallery section={section} preview={preview} navigation={navigation} />;
    return <section id={section.id} className={"mv-section mv-shell mv-" + section.id}>
        <header className="mv-heading">{section.id === "faq" && <span className="mv-faq-eyebrow">FAQ</span>}<h2>{section.title}</h2>{section.description ? <p>{section.description}</p> : section.id === "faq" && <p>开始创作前，你可能想了解这些。</p>}{section.id === "entries" && <p>为创作而生</p>}</header>
        {section.id === "faq" ? <div className="mv-faq-list">{section.items.map((item, index) => <details key={index} name={id}><summary><span className="mv-faq-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span>{item.title}</span><Plus aria-hidden="true" /></summary><p>{item.description}</p>{item.media.resourceId && <CinemaMedia value={item.media} preview={preview} />}{item.link && <CreationLink className="mv-text-link" href={item.link} navigation={navigation}>了解更多<ArrowUpRight aria-hidden="true" /></CreationLink>}</details>)}</div> : <>
            {section.id === "process" && !content.heroMedia.resourceId && <div className="mv-story"><h3>{content.storyTitle}</h3><p>{content.storyText}</p><small>{content.storyCaption}</small></div>}
            <div className="mv-tool-grid">{items.map((item, index) => <article key={index} className={"mv-tool-card mv-tool-" + index % 3}>
                <div className="mv-tool-copy"><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}{item.link && <CreationLink className="mv-text-link" href={item.link} navigation={navigation}>立即体验<ArrowUpRight aria-hidden="true" /></CreationLink>}</div>
                {section.id === "entries" && !item.media.resourceId ? <BrandProductPreview kind={PRODUCT_ENTRIES.find((entry) => entry.link.split("?")[0] === item.link.split("?")[0])?.kind ?? PRODUCT_ENTRIES[index % 3].kind} /> : <figure><CinemaMedia value={item.media} preview={preview} fallback={{ src: ARTWORK[(index + 1) % ARTWORK.length].image, alt: ARTWORK[(index + 1) % ARTWORK.length].alt }} /></figure>}
            </article>)}</div>
        </>}
    </section>;
}

export function BrandSite({ content, preview = false }: { content: BrandContent; preview?: boolean; authenticated?: boolean }) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const theme = useThemeStore((state) => state.theme);
    const [menu, setMenu] = useState(false);
    const sections = content.sections.filter((section) => section.visible);
    const navigation: NavigationProps = preview ? { onClick: (event) => event.preventDefault() } : { onClick: () => setMenu(false) };
    const Main = preview ? "div" : "main";
    const wordmark = <><BrandLogo theme="dark" className="mv-brand-mark" alt="" fallback={null} /><strong>{appearance.brandName}<small>{brandStudioLabel(appearance)}</small></strong></>;
    return <div className="mengceng-site mc-vidu" data-studio-theme={theme} data-preview={preview || undefined}>
        <a className="mv-skip" href="#mengceng-main" {...navigation}>跳到正文</a>
        <header className="mv-navigation">
            <BrandLink className="mv-brand" href="/" {...navigation}><BrandLogo theme="dark" className="mv-brand-mark" alt="" fallback={null} /><strong>{brandStudioLabel(appearance)}</strong></BrandLink>
            <nav className="mv-desktop-nav" aria-label="首页导航">
                <details className="mv-product-menu" onPointerEnter={(event) => { if (event.pointerType === "mouse") event.currentTarget.open = true; }} onPointerLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) event.currentTarget.open = false; }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>产品功能<ChevronDown aria-hidden="true" /></summary><div>{CREATION_LINKS.map((link) => <CreationLink key={link.href} href={link.href} navigation={navigation}><strong>{link.title}</strong><span>{link.description}</span></CreationLink>)}</div></details>
                <BrandLink href="#video" {...navigation}>视频创作</BrandLink><BrandLink href="#creation" {...navigation}>创作工作台</BrandLink>
                <a href="/features" onClick={navigation.onClick}>功能详解</a><a href="/tutorials" onClick={navigation.onClick}>创作教程</a>
                {sections.some((section) => section.id === "examples") && <BrandLink href="#examples" {...navigation}>创意影像</BrandLink>}
                {sections.some((section) => section.id === "faq") && <BrandLink href="#faq" {...navigation}>常见问题</BrandLink>}
            </nav>
            <div className="mc-nav-actions"><CreationLink className="mv-button mv-nav-cta" href={content.primaryLink} navigation={navigation}>{content.primaryLabel}</CreationLink><button className="mv-mobile-toggle" type="button" aria-label={menu ? "关闭导航" : "打开导航"} aria-expanded={menu} aria-controls="mv-mobile-navigation" onClick={() => setMenu(!menu)}>{menu ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button></div>
            {menu && <nav id="mv-mobile-navigation" className="mv-mobile-nav" aria-label="移动导航">{CREATION_LINKS.map((link) => <CreationLink key={link.href} href={link.href} navigation={navigation}>{link.title}<ArrowUpRight aria-hidden="true" /></CreationLink>)}<a href="/features" onClick={navigation.onClick}>功能详解</a><a href="/tutorials" onClick={navigation.onClick}>创作教程</a>{sections.map((section) => <BrandLink key={section.id} href={"#" + section.id} {...navigation}>{section.title}</BrandLink>)}</nav>}
        </header>
        <Main id="mengceng-main" tabIndex={-1}>
            <Hero content={content} preview={preview} navigation={navigation} />
            <BrandInspirationGallery preview={preview} />
            <FeatureFilms preview={preview} navigation={navigation} />
            {sections.map((section) => <Fragment key={section.id}>
                <PublishedSection section={section} content={content} preview={preview} navigation={navigation} />
                {section.id === "entries" && <section id="workflow" className="mv-section mv-shell mv-workflow" aria-labelledby="mv-workflow-title">
                    <header className="mv-heading"><h2 id="mv-workflow-title">让创意，在画布上生长。</h2><p>切换一种创作方向，连接参考素材，探索画面的更多可能。</p></header>
                    <BrandWorkflowTheater preview={preview} creationLink="/canvas" />
                </section>}
            </Fragment>)}
        </Main>
        <footer className="mv-footer mv-shell"><div className="mv-footer-top"><BrandLink className="mv-brand" href="/" {...navigation}>{wordmark}</BrandLink><div><strong>创作</strong>{CREATION_LINKS.slice(0, 2).map((link) => <CreationLink key={link.href} href={link.href} navigation={navigation}>{link.title}</CreationLink>)}</div><div><strong>工作空间</strong>{CREATION_LINKS.slice(2).map((link) => <CreationLink key={link.href} href={link.href} navigation={navigation}>{link.title}</CreationLink>)}</div><div><strong>了解梦层</strong><a href="/features" onClick={navigation.onClick}>功能详解</a><a href="/tutorials" onClick={navigation.onClick}>创作教程</a>{sections.filter((section) => ["examples", "faq"].includes(section.id)).map((section) => <BrandLink key={section.id} href={"#" + section.id} {...navigation}>{section.id === "examples" ? "创意影像" : "常见问题"}</BrandLink>)}</div></div><div className="mv-footer-bottom"><small>{appearance.footerCopyright}</small>{appearance.icpFilingEnabled && <BrandLink href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" {...navigation}>{appearance.icpFilingNumber}</BrandLink>}</div></footer>
    </div>;
}
