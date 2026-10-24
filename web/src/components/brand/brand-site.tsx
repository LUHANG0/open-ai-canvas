import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Expand } from "lucide-react";
import { brandStudioLabel, useAppearanceStore } from "@/stores/use-appearance-store";
import { BrandLink } from "./brand-link";
import { BrandLogo } from "./brand-logo";
import { BrandFilmStage } from "./brand-film-stage";
import { BrandWorkflowTheater } from "./brand-workflow-theater";
import { BrandTechniques } from "./brand-techniques";
import { useThemeStore } from "@/stores/use-theme-store";
import { brandMediaURL, type BrandContent, type BrandMedia, type BrandItem, type BrandSection } from "@/services/api/brand-site";
import { loginPath } from "@/lib/auth-navigation";
import "./brand-site.css";

const GalleryModal = lazy(() => import("@/components/ui/product/app-modal/app-modal").then((module) => ({ default: module.AppModal })));
const STORY_SHOTS = [
    { file: "wide", alt: "红衣女子站在盐原上，仰望悬在天空的巨浪。AI 品牌创意示意。" },
    { file: "character", alt: "同一位红衣女子迎着晨光仰望天空，风吹起她的黑发。AI 品牌创意示意。" },
    { file: "detail", alt: "红色衣袖下的手轻触盐原浅水，晨光落在盐晶上。AI 品牌创意示意。" },
] as const;
const GALLERY_SHOTS = [
    { file: "city", alt: "雨后的城市街道，奔跑的人穿过建筑间的一束日光。AI 品牌创意示意。" },
    { file: "train", alt: "列车窗边的年轻女子望向窗外，日光照亮她的侧脸。AI 品牌创意示意。" },
    { file: "world", alt: "青绿群山与云雾之间，一位骑马的人走过古桥。AI 品牌创意示意。" },
] as const;
type LinkProps = { onClick?: React.MouseEventHandler<HTMLAnchorElement> };

function StoryArtwork({ index = 0 }: { index?: number }) {
    const shot = STORY_SHOTS[index % STORY_SHOTS.length];
    return <img src={`/brand/v5/story-${shot.file}.webp`} width={724} height={724} alt={shot.alt} loading="lazy" decoding="async" />;
}
function BrandVideo({ value, preview, onError }: { value: BrandMedia; preview: boolean; onError: () => void }) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const pause = () => { if (document.visibilityState === "hidden") ref.current?.pause(); };
        const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) ref.current?.pause(); });
        if (ref.current) observer?.observe(ref.current);
        document.addEventListener("visibilitychange", pause);
        return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", pause); };
    }, []);
    return <video ref={ref} src={brandMediaURL(value.resourceId, preview)} poster={value.posterId ? brandMediaURL(value.posterId, preview) : undefined} controls playsInline preload="metadata" aria-label={value.alt || "品牌影片"} onError={onError} />;
}
function Media({ value, preview, fallback, priority = false }: { value: BrandMedia; preview: boolean; fallback?: React.ReactNode; priority?: boolean }) {
    const [failed, setFailed] = useState("");
    if (!value.resourceId || failed === value.resourceId) return <>
        {failed && <p role="status" className="mc-media-error">媒体未能加载{fallback ? "，以下显示内置展示。" : "，请稍后刷新重试。"}</p>}
        {fallback}
    </>;
    const fail = () => setFailed(value.resourceId);
    return value.kind === "video" ? <BrandVideo value={value} preview={preview} onError={fail} /> : <img src={brandMediaURL(value.resourceId, preview)} alt={value.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} onError={fail} />;
}
function Gallery({ section, preview, linkProps }: { section: BrandSection; preview: boolean; linkProps: LinkProps }) {
    const [opened, setOpened] = useState<number | null>();
    const chosen = typeof opened === "number" ? section.items[opened] : undefined;
    useEffect(() => {
        if (typeof opened !== "number" || section.items.length < 2) return;
        const navigate = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target as HTMLElement)?.closest?.("video,input,textarea")) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setOpened((index) => typeof index === "number" ? (index + (event.key === "ArrowLeft" ? -1 : 1) + section.items.length) % section.items.length : index);
        };
        document.addEventListener("keydown", navigate);
        return () => document.removeEventListener("keydown", navigate);
    }, [opened, section.items.length]);
    const artwork = (index: number) => {
        const shot = GALLERY_SHOTS[index % GALLERY_SHOTS.length];
        return <img src={`/brand/v5/gallery-${shot.file}.webp`} width={724} height={724} alt={shot.alt} loading="lazy" decoding="async" />;
    };
    return <>
        <div className="mc-gallery" data-count={section.items.length}>
            {section.items.map((item, index) => <article className="mc-gallery-tile" key={index}>
                <figure className="mc-gallery-picture" data-custom={Boolean(item.media.resourceId) || undefined}>
                    {item.media.kind === "video" && item.media.resourceId ? <Media value={item.media} preview={preview} /> : <button className="mc-gallery-open" type="button" aria-label={`查看${item.title}品牌影像`} onClick={() => setOpened(index)}><Media value={item.media} preview={preview} fallback={artwork(index)} /></button>}
                    <figcaption><span>{item.title}</span><Expand aria-hidden="true" /></figcaption>
                </figure>
                {(item.description || item.link) && <div className="mc-gallery-copy">{item.description && <p>{item.description}</p>}{item.link && <BrandLink href={item.link.startsWith("/") ? loginPath(item.link) : item.link} {...linkProps}>进入{item.title}<ArrowUpRight aria-hidden="true" /></BrandLink>}</div>}
            </article>)}
        </div>
        {opened !== undefined && <Suspense fallback={null}><GalleryModal open={Boolean(chosen)} flush centered width={1100} title={chosen?.title || "品牌影像"} footer={null} onCancel={() => setOpened(null)} rootClassName="mc-gallery-modal">{chosen && <div className="mc-lightbox"><Media key={opened} value={chosen.media} preview={preview} fallback={artwork(opened!)} />{section.items.length > 1 && <div className="mc-lightbox-controls"><button type="button" aria-label="上一张影像" onClick={() => setOpened((opened! - 1 + section.items.length) % section.items.length)}><ArrowLeft aria-hidden="true" /></button><span aria-live="polite">{opened! + 1} / {section.items.length}</span><button type="button" aria-label="下一张影像" onClick={() => setOpened((opened! + 1) % section.items.length)}><ArrowRight aria-hidden="true" /></button></div>}</div>}</GalleryModal></Suspense>}
    </>;
}
function ProcessSteps({ items, preview, linkProps }: { items: BrandItem[]; preview: boolean; linkProps: LinkProps }) {
    const [selected, setSelected] = useState(0);
    const id = useId();
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);
    const active = Math.min(selected, items.length - 1);
    if (!items.length) return null;
    return <div className="mc-process-stage">
        <div role="tablist" aria-label="创作阶段" aria-orientation="vertical" className="mc-stage-tabs">{items.map((item, index) => <button key={index} ref={(node) => { tabs.current[index] = node; }} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => {
            if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : ["ArrowDown", "ArrowRight"].includes(event.key) ? (index + 1) % items.length : ["ArrowUp", "ArrowLeft"].includes(event.key) ? (index - 1 + items.length) % items.length : null;
            if (next === null) return;
            event.preventDefault(); setSelected(next); tabs.current[next]?.focus();
        }}><span>{item.title}</span><ArrowRight aria-hidden="true" /></button>)}</div>
        <div className="mc-stage-panels">{items.map((item, index) => <div key={index} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} tabIndex={0} hidden={active !== index} className="mc-stage-panel">
            <figure className="mc-stage-picture">{(active === index || item.media.kind !== "video") && <Media value={item.media} preview={preview} fallback={<StoryArtwork index={index} />} />}</figure>
            <div className="mc-stage-copy"><h3>{item.title}</h3><p>{item.description}</p>{item.link && <BrandLink className="mc-content-link" href={item.link} {...linkProps}>进入{item.title}<ArrowUpRight aria-hidden="true" /></BrandLink>}</div>
        </div>)}</div>
    </div>;
}
export function BrandSite({ content, preview = false }: { content: BrandContent; preview?: boolean; authenticated?: boolean }) {
    const siteRef = useRef<HTMLDivElement>(null);
    const appearance = useAppearanceStore((state) => state.appearance);
    const theme = useThemeStore((state) => state.theme);
    const creationEntry = loginPath(content.primaryLink);
    const linkProps = preview ? { onClick: (event: React.MouseEvent) => event.preventDefault() } : {};
    const ContentRoot = preview ? "div" : "main";
    const visible = content.sections.filter((section) => section.visible && section.id !== "entries");
    useEffect(() => {
        const root = siteRef.current;
        if (!root || preview || typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const target = entry.target as HTMLElement;
                if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && typeof target.animate === "function") target.animate([{ clipPath: "inset(0 0 12% 0)", opacity: 0.7, transform: "translateY(18px)" }, { clipPath: "inset(0)", opacity: 1, transform: "translateY(0)" }], { duration: 650, easing: "cubic-bezier(0.23,1,0.32,1)" });
                observer.unobserve(target);
            });
        }, { threshold: 0.12 });
        root.querySelectorAll(".mc-gallery-picture").forEach((element) => observer.observe(element));
        return () => observer.disconnect();
    }, [preview, content]);
    const wordmark = <><BrandLogo theme="dark" className="mc-brand-symbol" alt="" fallback={null} /><span className="mc-wordmark"><strong>{appearance.brandName}</strong><small>{brandStudioLabel(appearance).toLocaleUpperCase()}</small></span></>;
    return <div ref={siteRef} className="mengceng-site" data-studio-theme={theme} data-preview={preview || undefined}>
        <a href="#mengceng-main" className="mc-skip" {...linkProps}>跳到正文</a>
        <header className="mc-nav"><BrandLink className="mc-brand" href="/" {...linkProps}>{wordmark}</BrandLink>
            <div className="mc-nav-actions"><BrandLink className="mc-button mc-primary" href={creationEntry} {...linkProps}>{content.primaryLabel}<ArrowUpRight aria-hidden="true" /></BrandLink></div>
        </header>
        <ContentRoot id="mengceng-main" tabIndex={-1}>
            <section className={`mc-hero${content.heroMedia.resourceId ? " mc-custom-hero" : ""}`}>
                {content.heroMedia.resourceId ? <figure className="mc-hero-custom-media"><Media value={content.heroMedia} preview={preview} priority /></figure> : <BrandFilmStage preview={preview} />}
                <div className="mc-hero-copy"><h1>{content.title.split("\n").map((line, index) => <span key={index}>{line}</span>)}</h1><p className="mc-lead">{content.description}</p>{content.detail && <p className="mc-detail">{content.detail}</p>}<BrandLink className="mc-button mc-hero-cta" href={creationEntry} {...linkProps}>{content.primaryLabel}<ArrowUpRight aria-hidden="true" /></BrandLink></div>
                {visible.length > 0 && <BrandLink className="mc-explore" href={`#${visible[0].id}`} {...linkProps}>探索更多<ArrowDown aria-hidden="true" /></BrandLink>}
            </section>
            {visible.map((section) => <section id={section.id} className={`mc-section mc-${section.id}`} key={section.id}>
                <div className="mc-section-heading"><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}</div>
                {section.id === "examples" ? <><BrandWorkflowTheater preview={preview} creationLink={content.primaryLink} /><Gallery section={section} preview={preview} linkProps={linkProps} /></> : section.id === "faq" ? <div className="mc-questions">{section.items.map((item, index) => <details key={index}><summary><span>{item.title}</span><span className="mc-faq-toggle" aria-hidden="true" /></summary><p>{item.description}</p></details>)}</div> : <>
                    {!content.heroMedia.resourceId && <details className="mc-story-intro"><summary>{content.storyTitle}</summary><p>{content.storyText}</p>{content.storyCaption && <p>{content.storyCaption}</p>}</details>}
                    <ProcessSteps items={section.items} preview={preview} linkProps={linkProps} />
                </>}
            </section>)}
            {visible.some((section) => section.id === "examples") && <BrandTechniques preview={preview} />}
            {content.footer && <section className="mc-closing"><h2>{content.footer}</h2><BrandLink className="mc-button mc-primary" href={creationEntry} {...linkProps}>{content.primaryLabel}<ArrowUpRight aria-hidden="true" /></BrandLink></section>}
        </ContentRoot>
        <footer className="mc-footer"><BrandLink className="mc-brand" href="/" {...linkProps}>{wordmark}</BrandLink><div className="mc-footer-meta"><BrandLink href="https://MengCeng.com" {...linkProps}>MengCeng.com</BrandLink>{appearance.icpFilingEnabled && <BrandLink href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" {...linkProps}>{appearance.icpFilingNumber}</BrandLink>}<small>{appearance.footerCopyright}</small></div></footer>
    </div>;
}
