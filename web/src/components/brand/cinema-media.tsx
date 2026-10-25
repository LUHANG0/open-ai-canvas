import { useEffect, useRef, useState } from "react";
import { brandMediaURL, type BrandMedia } from "@/services/api/brand-site";

type Artwork = { src: string; alt: string };

function ManagedVideo({ value, preview, onError, onReady }: { value: BrandMedia; preview: boolean; onError: () => void; onReady?: () => void }) {
    const video = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const element = video.current;
        const onVisibility = () => { if (document.visibilityState === "hidden") element?.pause(); };
        const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) element?.pause(); });
        if (element) observer?.observe(element);
        document.addEventListener("visibilitychange", onVisibility);
        return () => { element?.pause(); observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
    }, []);
    return <video ref={video} src={brandMediaURL(value.resourceId, preview)} poster={value.posterId ? brandMediaURL(value.posterId, preview) : undefined} controls playsInline aria-label={value.alt || "品牌影片"} onError={onError} onLoadedData={onReady} preload={onReady ? "auto" : "metadata"} />;
}

export function CinemaMedia({ value, preview = false, fallback, priority = false, onReady }: { value?: BrandMedia; preview?: boolean; fallback?: Artwork; priority?: boolean; onReady?: () => void }) {
    const [failed, setFailed] = useState("");
    const custom = value?.resourceId && failed !== value.resourceId;
    return <>
        {failed && failed === value?.resourceId && <p className="cinema-media-error" role="status">影像暂时无法加载{fallback ? "，正在展示内置创意画面。" : "，请稍后重试。"}</p>}
        {custom ? value.kind === "video" ? <ManagedVideo key={value.resourceId} value={value} preview={preview} onReady={onReady} onError={() => setFailed(value.resourceId)} /> : <img src={brandMediaURL(value.resourceId, preview)} alt={value.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} onLoad={onReady} onError={() => setFailed(value.resourceId)} /> : fallback && <img src={fallback.src} alt={fallback.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} decoding="async" onLoad={onReady} />}
    </>;
}
