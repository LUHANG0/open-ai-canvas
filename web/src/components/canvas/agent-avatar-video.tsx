import { useEffect, useLayoutEffect, useRef } from "react";
import { startAgentAvatarVideo, type AgentAvatarVideoSession } from "./agent-avatar-video-renderer";

export function AgentAvatarVideo({ src, loop = true, onError, className }: { src: string; loop?: boolean; onError?: () => void; className?: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const rendererRef = useRef<AgentAvatarVideoSession | null>(null);
    const errorRef = useRef(onError);
    errorRef.current = onError;

    useLayoutEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const renderer = startAgentAvatarVideo(video, () => errorRef.current?.());
        rendererRef.current = renderer;
        return () => {
            renderer.dispose();
            rendererRef.current = null;
        };
    }, []);

    useLayoutEffect(() => {
        rendererRef.current?.setSource();
    }, [src]);

    useLayoutEffect(() => {
        rendererRef.current?.setClassName(className);
    }, [className, src]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.loop = loop;
        if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) void video.play().catch(() => undefined);
    }, [src, loop]);

    return (
        <>
            <video
                ref={videoRef}
                src={src}
                autoPlay
                muted
                loop={loop}
                playsInline
                preload="auto"
                aria-hidden="true"
                draggable={false}
                onError={() => errorRef.current?.()}
                className="canvas-agent-video-source"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
            />
        </>
    );
}
