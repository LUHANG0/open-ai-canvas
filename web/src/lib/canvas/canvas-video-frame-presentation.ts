/** Keep the poster until a video frame has actually been presented. */
export function revealCanvasVideoFrame(video: HTMLVideoElement, reveal: () => void) {
    let disposed = false;
    let frame: number | undefined;
    let raf: number | undefined;
    const present = () => {
        if (!disposed && video.readyState >= 2) reveal();
    };
    if (typeof video.requestVideoFrameCallback === "function") {
        frame = video.requestVideoFrameCallback(present);
    } else {
        const decoded = () => {
            if (disposed || video.readyState < 2 || video.paused || raf !== undefined) return;
            raf = requestAnimationFrame(() => {
                raf = requestAnimationFrame(() => {
                    raf = undefined;
                    present();
                });
            });
        };
        video.addEventListener("playing", decoded);
        video.addEventListener("loadeddata", decoded);
        decoded();
        return () => {
            disposed = true;
            if (raf !== undefined) cancelAnimationFrame(raf);
            video.removeEventListener("playing", decoded);
            video.removeEventListener("loadeddata", decoded);
        };
    }
    return () => {
        disposed = true;
        if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
    };
}
