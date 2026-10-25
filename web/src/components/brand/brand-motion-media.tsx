import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WorkflowMedia } from "./brand-workflow-scenes";
import "./brand-motion-media.css";

export function BrandMotionMedia({ media, enabled, visible }: { media: WorkflowMedia; enabled: boolean; visible: boolean }) {
    const video = useRef<HTMLVideoElement>(null);
    const [ready, setReady] = useState(false);
    // A reattached source starts a new load even when its URL has not changed.
    useLayoutEffect(() => { setReady(false); }, [media.video, visible]);
    useEffect(() => {
        const element = video.current;
        if (!element) return;
        if (enabled) void element.play().catch(() => { /* Keep the poster when browser autoplay is unavailable. */ });
        else element.pause();
        return () => element.pause();
    }, [enabled, visible]);
    return <div className="mc-motion-media"><img src={media.image} alt="" loading="lazy" decoding="async" />{media.video && <video ref={video} src={visible ? media.video : undefined} poster={media.image} muted loop playsInline preload="none" aria-hidden="true" data-ready={visible && ready || undefined} onLoadStart={() => setReady(false)} onEmptied={() => setReady(false)} onLoadedData={() => setReady(true)} onError={() => setReady(false)} />}</div>;
}
