import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useAuthReducedMotion } from "@/pages/auth/use-auth-motion";
import { VIDU_MEDIA } from "./brand-reference-media";

const slides = [
    { src: VIDU_MEDIA.character.image, alt: "烛光下，女子手持塔罗牌坐在桌前" },
    { src: VIDU_MEDIA.cinema.image, alt: "身穿橙色宇航服的人物与小鸟在月球上合影" },
    { src: VIDU_MEDIA.performance.image, alt: "老虎眼睛与斑纹毛发的近景特写" },
];

export default function BrandAuthShowcase({ open }: { open: boolean }) {
    const root = useRef<HTMLElement>(null);
    const reduced = useAuthReducedMotion();
    const [index, setIndex] = useState(0);
    const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
    const [ready, setReady] = useState(false);
    const [visible, setVisible] = useState(false);
    const [activated, setActivated] = useState(false);
    const [pageVisible, setPageVisible] = useState(() => !document.hidden);
    const [paused, setPaused] = useState(false);
    const [focused, setFocused] = useState(false);
    const remaining = slides.length - failed.size;
    const playing = open && visible && pageVisible && ready && !paused && !focused && !reduced && remaining > 1;

    useEffect(() => {
        const page = () => setPageVisible(!document.hidden);
        const update = (intersecting: boolean) => {
            setVisible(intersecting);
            if (intersecting) setActivated(true);
        };
        const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => update(entry.isIntersecting), { threshold: .1 });
        if (root.current) {
            if (observer) observer.observe(root.current);
            else update(root.current.getClientRects().length > 0);
        }
        document.addEventListener("visibilitychange", page);
        return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", page); };
    }, []);

    useEffect(() => {
        if (!playing) return;
        const timer = window.setTimeout(() => {
            const next = slides.findIndex((_, candidate) => candidate > index && !failed.has(candidate));
            setReady(false);
            setIndex(next < 0 ? slides.findIndex((_, candidate) => !failed.has(candidate)) : next);
        }, 6000);
        return () => window.clearTimeout(timer);
    }, [playing, index, failed]);

    const select = (next: number) => {
        setPaused(true);
        if (next !== index) { setReady(false); setIndex(next); }
    };
    const skipFailed = () => {
        const unavailable = new Set(failed).add(index);
        setFailed(unavailable); setReady(false);
        const next = slides.findIndex((_, candidate) => !unavailable.has(candidate));
        if (next >= 0) setIndex(next);
    };

    return <aside ref={root} className="mc-auth-showcase" aria-label="创作灵感" aria-roledescription="图片轮播" onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <div className="mc-auth-showcase-image" aria-busy={activated && !ready && remaining > 0}>
            {activated && remaining > 0 ? <img key={index} src={slides[index].src} alt={slides[index].alt} loading="eager" fetchPriority={index === 0 ? "high" : "auto"} decoding="async" onLoad={() => setReady(true)} onError={skipFailed} /> : remaining === 0 ? <p role="status">灵感图片暂不可用，不影响登录。</p> : null}
        </div>
        <div className="mc-auth-showcase-caption">
            <h3>让想法，成为下一幕。</h3>
            <p>从一个灵感出发，在梦层继续你的故事。</p>
            <div className="mc-auth-showcase-controls" role="group" aria-label="灵感图片控制">
                <div className="mc-auth-showcase-dots">
                    {slides.map((slide, candidate) => <button key={slide.src} type="button" aria-label={`查看灵感图片 ${candidate + 1}：${slide.alt}`} aria-pressed={candidate === index && !failed.has(candidate)} disabled={failed.has(candidate)} onClick={() => select(candidate)}><span aria-hidden="true" /></button>)}
                </div>
                <button type="button" className="mc-auth-showcase-toggle" aria-label={reduced ? "已关闭自动轮播" : paused ? "播放灵感图片轮播" : "暂停灵感图片轮播"} disabled={reduced || remaining < 2} onClick={() => setPaused((value) => !value)}>{paused || reduced ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}<span>{reduced ? "手动浏览" : paused ? "播放" : "暂停"}</span></button>
            </div>
        </div>
    </aside>;
}
