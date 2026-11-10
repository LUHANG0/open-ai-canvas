import { useEffect, useLayoutEffect, useRef } from "react";
import { startAgentAvatarVideo, type AgentAvatarVideoSession } from "./agent-avatar-video-renderer";

/**
 * 绿幕形象视频：每帧把视频画到画布上做抠像。抠像在主线程逐像素处理，开销不小，
 * 所以 paused（入口被面板挡住时）和页面隐藏时都不处理帧，也暂停视频解码。
 */
export function AgentAvatarVideo({ src, loop = true, paused = false, onError, className }: { src: string; loop?: boolean; paused?: boolean; onError?: () => void; className?: string }) {
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
        if (paused) {
            video.pause();
            return;
        }
        // pause() 会清掉 autoplay 标记，恢复时必须显式播放；已在播放时 play() 不会重来。
        void video.play().catch(() => undefined);
    }, [src, loop, paused]);

    return (
        <>
            <video
                ref={videoRef}
                src={src}
                autoPlay={!paused}
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
