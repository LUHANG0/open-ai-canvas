import { useEffect, useRef } from "react";
import { claimMediaPlayback, releaseMediaPlayback } from "@/lib/canvas/media-playback-focus";
import { useCanvasPlaybackController, useCanvasPlaybackSound } from "./canvas-playback-context";

/** Asset previews participate in the same focus/sound rules as node media. */
export function useCanvasNativeMedia<T extends HTMLMediaElement>(source: string) {
    const ref = useRef<T>(null);
    const position = useRef(0);
    const controller = useCanvasPlaybackController();
    const sound = useCanvasPlaybackSound();
    useEffect(() => {
        const media = ref.current;
        if (!media) return;
        const play = () => {
            claimMediaPlayback(ref, "explicit", () => media.pause());
        };
        const pause = () => releaseMediaPlayback(ref);
        const record = () => {
            if (media.readyState >= 2 && Number.isFinite(media.currentTime)) position.current = media.currentTime;
        };
        const loaded = () => {
            if (position.current > 0 && position.current < media.duration) media.currentTime = position.current;
        };
        const volume = () => controller?.setSound({ muted: media.muted, volume: media.volume });
        media.addEventListener("play", play);
        media.addEventListener("pause", pause);
        media.addEventListener("ended", pause);
        media.addEventListener("timeupdate", record);
        media.addEventListener("error", record);
        media.addEventListener("loadedmetadata", loaded);
        media.addEventListener("volumechange", volume);
        return () => {
            record();
            releaseMediaPlayback(ref);
            media.pause();
            media.removeEventListener("play", play);
            media.removeEventListener("pause", pause);
            media.removeEventListener("ended", pause);
            media.removeEventListener("timeupdate", record);
            media.removeEventListener("error", record);
            media.removeEventListener("loadedmetadata", loaded);
            media.removeEventListener("volumechange", volume);
        };
    }, [source, controller]);
    useEffect(() => {
        if (ref.current) {
            ref.current.volume = sound.volume;
            ref.current.muted = sound.muted;
        }
    }, [sound, source]);
    return ref;
}
