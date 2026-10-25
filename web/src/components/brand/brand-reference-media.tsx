import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const CDN = "https://image01-aliyun.vidu.zone/vidu/media-asset/";
export const VIDU_MEDIA = {
    sports: { image: CDN + "vidu-video-3488283751768918-0424137d.webp", video: CDN + "vidu-video-3488283751768918-e040f238.mp4", alt: "红色烟雾中的橄榄球运动员" },
    cinema: { image: CDN + "S11-753ab643.webp", video: CDN + "S11-cdefb97a.mp4", alt: "富有张力的电影级场景" },
    performance: { image: CDN + "20260930-162913-2f478476.webp", video: CDN + "20260930-162913-50e833e5.mp4", alt: "细腻的动物眼睛与毛发特写" },
    character: { image: CDN + "S12-6c353cae.webp", video: CDN + "S12-ca6d5ddb.mp4", alt: "烛光下的人物表演" },
};
// Public source: https://www.vidu.cn/ . Direct references, not MengCeng customer work.
export type ReferenceMedia = { image: string; video?: string; alt: string };

export function ReferenceFilm({ media, preview = false, priority = false, className = "", onReady }: { media: ReferenceMedia; preview?: boolean; priority?: boolean; className?: string; onReady?: () => void }) {
    const root = useRef<HTMLDivElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const [visible, setVisible] = useState(false);
    const [pageVisible, setPageVisible] = useState(true);
    const [reduced, setReduced] = useState(true);
    const [manual, setManual] = useState<boolean | null>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [posterFailed, setPosterFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const wantsPlay = manual ?? !reduced;
    const playing = !preview && visible && pageVisible && wantsPlay && !failed;
    useEffect(() => {
        const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        const update = () => { setReduced(mediaQuery?.matches ?? true); setManual(null); };
        const page = () => setPageVisible(document.visibilityState !== "hidden");
        update(); page();
        mediaQuery?.addEventListener("change", update);
        document.addEventListener("visibilitychange", page);
        const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .08 });
        if (root.current) observer?.observe(root.current);
        return () => { observer?.disconnect(); mediaQuery?.removeEventListener("change", update); document.removeEventListener("visibilitychange", page); };
    }, []);
    useEffect(() => { if (playing) setLoaded(true); }, [playing]);
    useEffect(() => {
        const element = video.current;
        if (!element) return;
        let active = true;
        if (playing && loaded) void element.play().catch(() => { if (active) setManual(false); });
        else element.pause();
        return () => { active = false; element.pause(); };
    }, [playing, loaded]);
    return <div ref={root} className={"mv-film " + className}>
        {!posterFailed && <img src={media.image} alt={media.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} decoding="async" onLoad={onReady} onError={() => setPosterFailed(true)} />}
        {!preview && media.video && <video ref={video} src={loaded ? media.video : undefined} poster={media.image} muted loop playsInline preload="none" aria-hidden="true" data-ready={ready || undefined} onLoadedData={() => { setReady(true); onReady?.(); }} onLoadStart={() => setReady(false)} onEmptied={() => setReady(false)} onError={() => { setFailed(true); setReady(false); }} />}
        {!preview && media.video && !failed && <button type="button" className="mv-playback" aria-label={(wantsPlay ? "暂停" : "播放") + media.alt} onClick={() => setManual(!wantsPlay)}>{wantsPlay ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>}
        {(failed || posterFailed) && <small className="mv-media-notice" role="status">{posterFailed ? "展示素材暂时无法加载" : "影片暂不可用，正在展示封面"}</small>}
    </div>;
}
