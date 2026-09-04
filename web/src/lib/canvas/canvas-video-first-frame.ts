type FrameScheduler = {
    request: typeof requestAnimationFrame;
    cancel: typeof cancelAnimationFrame;
};

// 地址可用或 canplay 不代表视频层已经绘制；封面要等当前源的画面进入合成后才揭开。
export function waitForCanvasVideoFirstFrame(video: HTMLVideoElement, onReady: () => void, frames: FrameScheduler = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
}) {
    const source = video.currentSrc || video.src;
    const supportsVideoFrames = typeof video.requestVideoFrameCallback === "function";
    let active = true;
    let videoFrame: number | null = null;
    let animationFrame: number | null = null;
    const hasCurrentFrame = () => active && (video.currentSrc || video.src) === source
        && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.seeking && !video.error;

    const cancel = () => {
        active = false;
        if (videoFrame !== null) video.cancelVideoFrameCallback(videoFrame);
        if (animationFrame !== null) frames.cancel(animationFrame);
        videoFrame = animationFrame = null;
        for (const event of ["loadeddata", "canplay", "playing", "pause", "seeked"]) video.removeEventListener(event, probe);
        video.removeEventListener("emptied", cancel);
        video.removeEventListener("loadstart", cancel);
    };
    const ready = () => {
        if (!hasCurrentFrame()) return false;
        cancel();
        onReady();
        return true;
    };
    const watchVideoFrame = () => {
        if (!active || !supportsVideoFrames || videoFrame !== null) return;
        videoFrame = video.requestVideoFrameCallback((_now, metadata) => {
            videoFrame = null;
            // 恢复播放进度时忽略 seek 前排队的旧帧。
            if (Math.abs(metadata.mediaTime - video.currentTime) < 0.25 && ready()) return;
            watchVideoFrame();
        });
    };
    const canUsePaintFallback = () => hasCurrentFrame() && (!supportsVideoFrames
        || (video.paused && (video.getVideoPlaybackQuality?.().totalVideoFrames || 0) > 0));
    function probe() {
        if (!active) return;
        watchVideoFrame();
        // 兼容无 RVFC 的浏览器，以及监听前已经呈现首帧、不会再送帧的暂停播放器。
        if (animationFrame !== null || !canUsePaintFallback()) return;
        animationFrame = frames.request(() => {
            if (!active) return;
            animationFrame = frames.request(() => {
                if (!active) return;
                animationFrame = null;
                if (canUsePaintFallback()) ready();
            });
        });
    }
    for (const event of ["loadeddata", "canplay", "playing", "pause", "seeked"]) video.addEventListener(event, probe);
    video.addEventListener("emptied", cancel);
    video.addEventListener("loadstart", cancel);
    probe();
    return cancel;
}
