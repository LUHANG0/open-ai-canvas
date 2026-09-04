import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaPlayerInstance } from "@vidstack/react";
import { canvasVideoPreviewGroup } from "@/lib/canvas/canvas-video-preview-session";

export function useCanvasVideoPreview(sourceIdentity: string, hovered: boolean | undefined, disabled: boolean) {
    const playerRef = useRef<MediaPlayerInstance>(null);
    const resumeRef = useRef({ source: sourceIdentity, time: 0, volume: 1, muted: false });
    const preparedPlayerRef = useRef<MediaPlayerInstance | null>(null);
    const playWantedRef = useRef(false);
    const removeLifecycleListeners = useRef<(() => void) | null>(null);
    const [activeSource, setActiveSource] = useState<string | null>(null);
    const [issue, setIssue] = useState<string | null>(null);
    const session = useMemo(() => {
        const nextSession = canvasVideoPreviewGroup.createSession({
            start: () => {
                if (document.hidden || !document.hasFocus()) { nextSession.stop(); return; }
                playWantedRef.current = true;
                setActiveSource(sourceIdentity);
                setIssue(null);
            },
            stop: () => {
                removeLifecycleListeners.current?.();
                removeLifecycleListeners.current = null;
                playWantedRef.current = false;
                const video = playerRef.current?.el?.querySelector("video");
                if (video) {
                    resumeRef.current = { source: sourceIdentity, time: video.ended ? 0 : video.currentTime, volume: video.volume, muted: video.muted };
                    video.pause();
                }
                setActiveSource(null);
                setIssue(null);
            },
        });
        return nextSession;
    }, [sourceIdentity]);
    const active = !disabled && activeSource === sourceIdentity;

    const play = useCallback(() => {
        const player = playerRef.current;
        if (!player?.state.canPlay || !session.isActive() || !playWantedRef.current || disabled || document.hidden || !document.hasFocus()) return;
        const token = session.token();
        // 明确保留原声；浏览器拒绝有声播放时提示点击，不通过静音绕过。
        void player.play().then(() => {
            if (!session.isActive() || !playWantedRef.current) void player.pause().catch(() => undefined);
            else if (session.isActive(token)) setIssue(null);
        }).catch((error: unknown) => {
            if (!session.isActive(token)) return;
            if (error instanceof Error && error.name === "AbortError") return;
            setIssue(error instanceof Error && error.name === "NotAllowedError" ? "点击画面播放原声" : "播放未成功，点击重试");
        });
    }, [disabled, session]);

    const start = useCallback((immediate = false) => {
        if (disabled || document.hidden || !document.hasFocus()) return;
        session.start(immediate);
        if (immediate) playWantedRef.current = true;
        removeLifecycleListeners.current?.();
        const onVisibility = () => { if (document.hidden) session.stop(); };
        const onBlur = () => session.stop();
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("blur", onBlur);
        removeLifecycleListeners.current = () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("blur", onBlur);
        };
        if (immediate) play();
    }, [disabled, play, session]);

    useEffect(() => () => session.stop(), [session]);
    useEffect(() => {
        const state = playerRef.current?.state;
        if (disabled || (hovered === false && !state?.fullscreen && !state?.pictureInPicture)) session.stop();
        else if (hovered) start();
    }, [disabled, hovered, session, start]);
    useEffect(() => {
        if (active) play();
    }, [active, play]);

    return {
        playerRef, active, issue, start,
        muted: resumeRef.current.source === sourceIdentity ? resumeRef.current.muted : false,
        volume: resumeRef.current.source === sourceIdentity ? resumeRef.current.volume : 1,
        stop: session.stop,
        requestPause: () => { playWantedRef.current = false; },
        rememberPlayback: () => {
            const player = playerRef.current;
            // 新播放器初始化时的默认音量事件不能覆盖上一次离开时保存的用户设置。
            if (!player || preparedPlayerRef.current !== player) return;
            const video = player.el?.querySelector("video");
            if (video) resumeRef.current = { source: sourceIdentity, time: video.ended ? 0 : video.currentTime, volume: video.volume, muted: video.muted };
        },
        onPresentationChange: (presented: boolean) => { if (!presented && !hovered) session.stop(); },
        onCanPlay: () => {
            const player = playerRef.current;
            const resume = resumeRef.current;
            if (player && preparedPlayerRef.current !== player) {
                preparedPlayerRef.current = player;
                if (resume.source === sourceIdentity) {
                    if (resume.time > 0 && resume.time < player.state.duration - 0.25) player.currentTime = resume.time;
                }
            }
            play();
        },
        onPlay: () => {
            if (!session.isActive() || !playWantedRef.current) void playerRef.current?.pause().catch(() => undefined);
            else setIssue(null);
        },
    };
}
