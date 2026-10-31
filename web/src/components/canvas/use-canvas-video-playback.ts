import { useEffect, type RefObject } from "react";
import { CanvasPlaybackController, VIDEO_HOVER_CURSOR_IDLE_MS, type CanvasPlaybackSession } from "@/lib/canvas/canvas-playback";

import { bindCanvasVideoHover } from "@/lib/canvas/canvas-video-hover";

export function useCanvasVideoSurface(boxRef: RefObject<HTMLDivElement | null>, controller: CanvasPlaybackController, session: CanvasPlaybackSession | null, nodeId: string, identity: string, url: string, ready: boolean) {
    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        return bindCanvasVideoHover(box, controller, nodeId, identity);
    }, [boxRef, controller, nodeId, identity]);

    useEffect(() => {
        if (!session || session.mode !== "hover" || session.intent !== "play" || session.status === "playing") return;
        const timeout = setTimeout(() => controller.failed(session.token), 8000);
        return () => clearTimeout(timeout);
    }, [controller, session?.token, session?.mode, session?.intent, session?.status]);

    useEffect(() => {
        if (!session) return;
        return controller.bind(session.token, {
            time: () => {
                const v = boxRef.current?.querySelector("video");
                return v && v.readyState >= 2 ? v.currentTime : undefined;
            },
            pause: () => boxRef.current?.querySelector("video")?.pause(),
            rewind: () => {
                const v = boxRef.current?.querySelector("video");
                if (v?.readyState) v.currentTime = 0;
            },
        });
    }, [controller, boxRef, session?.token]);

    useEffect(() => {
        const video = boxRef.current?.querySelector("video");
        if (!video || !session || !url) return;
        const token = session.token;
        const record = () => {
            if (video.readyState >= 2) controller.recordTime(token, video.currentTime);
        };
        video.addEventListener("timeupdate", record);
        video.addEventListener("seeked", record);
        video.addEventListener("pause", record);
        return () => {
            record();
            video.removeEventListener("timeupdate", record);
            video.removeEventListener("seeked", record);
            video.removeEventListener("pause", record);
        };
    }, [boxRef, controller, session?.token, url]);

    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const show = () => {
            clearTimeout(timer);
            delete box.dataset.hoverCursorHidden;
            if (ready && session?.intent === "play" && session.status === "playing")
                timer = setTimeout(() => {
                    box.dataset.hoverCursorHidden = "true";
                }, VIDEO_HOVER_CURSOR_IDLE_MS);
        };
        show();
        box.addEventListener("pointermove", show);
        return () => {
            clearTimeout(timer);
            delete box.dataset.hoverCursorHidden;
            box.removeEventListener("pointermove", show);
        };
    }, [boxRef, ready, session?.intent, session?.status]);
}
