import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Play, RotateCcw } from "lucide-react";
import "./brand-inspiration-gallery.css";

export type InspirationWork = {
    title: string;
    image: string;
    video?: string;
    href?: string;
};

const COVER_BASE = "https://static-oiioii-sg.hogiai.cn/home_recommends_v2/";
const cover = (filename: string) => COVER_BASE + filename;
export const BRAND_INSPIRATION_WORKS: InspirationWork[] = [
    { title: "呱呱与辣条的奇妙冒险", image: cover("1bf97bf8-7bce-4772-bcff-c2e4bbfdbd3a_cover_w480q80v2.webp"), video: cover("63bf87d9-e3c2-4927-a6fc-a8e66571d920_video.mp4"), href: "https://v.douyin.com/cjYD1QXbM3g/" },
    { title: "听见你的心声", video: cover("5c4addf8-3895-4209-8278-66f51c7120a6_video.mp4"), image: cover("59ebf050-4353-4098-b15d-0ee67dd4430c_cover_w480q80v2.webp"), href: "https://v.douyin.com/Hc7TchwK3DM/" },
    { title: "宠物重生计", video: cover("0f563c66-ec09-4b9a-92a4-024fa06b8198_video.mp4"), image: cover("987333af-956f-499e-90b8-c2a2207085d1_cover_w480q80v2.webp"), href: "https://v.douyin.com/JZvxBMVLUtY/" },
    { title: "上岸", video: cover("5068f566-309f-4488-83e4-f441efe03cdb_video.mp4"), image: cover("8464bd80-7a83-489c-a411-2f1748b711d9_cover_w480q80v2.webp"), href: "https://v.douyin.com/4rS72Bw1Jcs/" },
    { title: "裤头与二胆：进城篇", video: cover("10bbf7d5-b8d5-4c2e-b1b0-cfa1deb25907_video.mp4"), image: cover("fe14beaa-aac0-4759-9d4c-7194279c81fd_cover_w480q80v2.webp"), href: "https://v.douyin.com/RXaSLHYty7E/" },
    { title: "别闹了法姥", video: cover("6504aad4-fc80-48bb-9c16-6a83ff80235a_video.mp4"), image: cover("a8de2269-5e13-4b33-8fdf-eef973460bbb_cover_w480q80v2.webp"), href: "https://v.douyin.com/2nA-MW8uuiE/" },
    { title: "广阔的土地生不出狭隘的心", video: cover("cc1de3b1-c2da-4c1c-89cd-6e2a37d6473b_video.mp4"), image: cover("a6c398a4-356b-4234-ad18-e0f085392e4e_cover_w480q80v2.webp"), href: "https://v.douyin.com/4j_yyeyYkEU/" },
    { title: "无畏契约丨校霸竟是我自己", video: cover("22bc8176-32f0-444e-898e-dd8bb77982b1_video.mp4"), image: cover("fe251fb7-e91a-4b99-9970-379b649ed6be_cover_w480q80v2.webp"), href: "https://v.douyin.com/VZg36TGe5s8/" },
    { title: "中秋在哪都要好好过", video: cover("a200e44f-afe0-443a-99c2-2a4e2de05e1a_video.mp4"), image: cover("02d4c848-a6fb-42b0-93d8-b0aef43b2c67_cover_w480q80v2.webp"), href: "https://v.douyin.com/va-gWCSkZ-c/" },
    { title: "口袋与金扣vlog", video: cover("ab56c23a-bb37-4598-8af6-2df609d2bd8d_video.mp4"), image: cover("70a4699e-b2f0-405d-9f63-5df96f8f4a77_cover_w480q80v2.webp") },
    { title: "山门外", video: cover("af2449f1-3fde-4487-b776-0fb6db32b622_video.mp4"), image: cover("db9ccb04-ca45-4126-a80d-0cb05f7e20e1_cover_w480q80v2.webp") },
    { title: "同锅", video: cover("c75fef54-929d-4c20-8ff2-a30e1768a3e0_video.mp4"), image: cover("821aae61-3634-4b82-84fb-a75140cd3a1b_cover.webp") },
];

const PlayerModal = lazy(() => import("@/components/ui/product/app-modal/app-modal").then((module) => ({ default: module.AppModal })));

function HoverPreview({ src }: { src: string }) {
    const video = useRef<HTMLVideoElement>(null);
    const [visible, setVisible] = useState(true);
    const [pageVisible, setPageVisible] = useState(!document.hidden);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const active = visible && pageVisible && !failed;
    useEffect(() => {
        const element = video.current;
        const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
        if (element) observer?.observe(element);
        const visibility = () => setPageVisible(!document.hidden);
        document.addEventListener("visibilitychange", visibility);
        return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", visibility); };
    }, []);
    useEffect(() => {
        const element = video.current;
        if (active) void element?.play().catch(() => {});
        else element?.pause();
        return () => element?.pause();
    }, [active]);
    return <video ref={video} className="mv-inspiration-preview" src={active ? src : undefined} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} data-ready={active && ready || undefined} onPlaying={() => setReady(true)} onError={() => setFailed(true)} />;
}

function WorkCover({ work, active }: { work: InspirationWork; active: boolean }) {
    const [failed, setFailed] = useState(false);
    return <span className="mv-inspiration-cover">
        {!failed ? <img src={work.image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span className="mv-inspiration-image-fallback">{work.title}</span>}
        {active && work.video && <HoverPreview src={work.video} />}
        <span className="mv-inspiration-play"><Play aria-hidden="true" fill="currentColor" /></span>
    </span>;
}

function WorkPlayer({ work, open, preview }: { work: InspirationWork; open: boolean; preview: boolean }) {
    const video = useRef<HTMLVideoElement>(null);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [buffering, setBuffering] = useState(false);
    useEffect(() => {
        const element = video.current;
        let active = true;
        if (open && element) {
            void element.play().catch(() => { if (active) setBuffering(false); });
        } else element?.pause();
        const visibility = () => { if (document.visibilityState === "hidden") element?.pause(); };
        document.addEventListener("visibilitychange", visibility);
        return () => { active = false; element?.pause(); document.removeEventListener("visibilitychange", visibility); };
    }, [open, retry]);
    return <div className="mv-inspiration-player">
        {!preview && work.video && !failed ? <video key={retry} ref={video} src={open ? work.video : undefined} poster={work.image} controls muted playsInline preload="metadata" aria-label={work.title} onPlay={() => setPlaying(true)} onPlaying={() => { setPlaying(true); setBuffering(false); }} onPause={() => setPlaying(false)} onWaiting={() => setBuffering(true)} onLoadStart={() => setBuffering(true)} onCanPlay={() => setBuffering(false)} onError={() => { setBuffering(false); setFailed(true); }} /> : <img src={work.image} alt={work.title} />}
        {!preview && work.video && !failed && !playing && <button className="mv-inspiration-start" type="button" aria-label="播放影片" onClick={() => { void video.current?.play().catch(() => setBuffering(false)); }}><Play aria-hidden="true" fill="currentColor" /><span>播放影片</span></button>}
        {!preview && !failed && buffering && <span className="mv-inspiration-buffering" role="status">正在加载影片…</span>}
        {failed && <div className="mv-inspiration-error" role="status"><p>影片暂时无法播放</p><button type="button" onClick={() => { setFailed(false); setRetry((value) => value + 1); }}><RotateCcw aria-hidden="true" />重新加载</button>{work.href && <a href={work.href} target="_blank" rel="noreferrer">观看作品<ArrowUpRight aria-hidden="true" /></a>}</div>}
        {!preview && !work.video && work.href && <a className="mv-inspiration-external" href={work.href} target="_blank" rel="noreferrer">观看作品<ArrowUpRight aria-hidden="true" /></a>}
    </div>;
}

export function BrandInspirationGallery({ preview = false }: { preview?: boolean }) {
    const [hovered, setHovered] = useState<number | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement | null>(null);
    const work = selected === null ? undefined : BRAND_INSPIRATION_WORKS[selected];
    const move = (delta: number) => setSelected((value) => value === null ? null : (value + delta + BRAND_INSPIRATION_WORKS.length) % BRAND_INSPIRATION_WORKS.length);
    useEffect(() => {
        if (!open) return;
        const keydown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || (event.target as HTMLElement)?.closest?.("video,input,textarea,select")) return;
            const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
            if (!delta) return;
            event.preventDefault();
            setSelected((value) => value === null ? null : (value + delta + BRAND_INSPIRATION_WORKS.length) % BRAND_INSPIRATION_WORKS.length);
        };
        document.addEventListener("keydown", keydown);
        return () => document.removeEventListener("keydown", keydown);
    }, [open]);
    return <section id="inspiration" className="mv-inspiration" aria-labelledby="mv-inspiration-heading">
        <header className="mv-inspiration-heading"><h2 id="mv-inspiration-heading">社媒爆款</h2><span>故事，在这里发生</span></header>
        <div className="mv-inspiration-grid">{BRAND_INSPIRATION_WORKS.map((item, index) => <button key={item.title} type="button" className="mv-inspiration-card" aria-label={"播放" + item.title} onPointerEnter={(event) => { if (event.pointerType === "mouse" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) setHovered(index); }} onPointerLeave={() => setHovered(null)} onClick={(event) => { setHovered(null); trigger.current = event.currentTarget; setSelected(index); setOpen(true); }}><WorkCover work={item} active={!preview && !open && hovered === index} /><span className="mv-inspiration-title">{item.title}</span></button>)}</div>
        {work && <Suspense fallback={<p className="mv-inspiration-loading" role="status">正在准备播放器…</p>}><PlayerModal open={open} title={work.title} footer={null} centered flush width={1120} rootClassName="mv-inspiration-modal" focusTriggerAfterClose={false} onCancel={() => setOpen(false)} afterClose={() => trigger.current?.focus({ preventScroll: true })}>
            <WorkPlayer key={selected} work={work} open={open} preview={preview} />
            <div className="mv-inspiration-controls"><button type="button" aria-label="上一部作品" onClick={() => move(-1)}><ArrowLeft aria-hidden="true" /><span>上一部</span></button><span className="mv-inspiration-position" aria-live="polite"><strong>{String(selected! + 1).padStart(2, "0")}</strong><span>/ {BRAND_INSPIRATION_WORKS.length}</span></span><button type="button" aria-label="下一部作品" onClick={() => move(1)}><span>下一部</span><ArrowRight aria-hidden="true" /></button></div>
        </PlayerModal></Suspense>}
    </section>;
}
