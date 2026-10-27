// Only the hovered node owns a decoder; pending hover work shares the same lease.
let stopCurrentPreview: (() => void) | undefined;
export const VIDEO_HOVER_DELAY_MS = 350;
export const VIDEO_HOVER_PREVIEW_MS = 3000;

export function bindCanvasVideoHoverPreview(element: HTMLElement, resolveSource: () => Promise<string>) {
    let stop: (() => void) | undefined;
    const enter = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || event.buttons || document.hidden
            || window.matchMedia("(prefers-reduced-motion: reduce)").matches
            || element.closest('[data-canvas-viewport-interacting="true"]')) return;
        stopCurrentPreview?.();
        let disposed = false;
        let video: HTMLVideoElement | undefined;
        let playbackTimer: ReturnType<typeof setTimeout> | undefined;
        let videoFrame: number | undefined;
        let animationFrame: number | undefined;
        const listeners = new AbortController();
        const viewport = element.closest("[data-canvas-viewport]");
        const visibility = new IntersectionObserver((entries) => {
            if (entries.some((entry) => !entry.isIntersecting)) cancel();
        });
        const observer = new MutationObserver(() => {
            if (viewport?.getAttribute("data-canvas-viewport-interacting") === "true") cancel();
        });
        const cancel = () => {
            if (disposed) return;
            disposed = true;
            clearTimeout(delay);
            clearTimeout(deadline);
            clearTimeout(playbackTimer);
            listeners.abort();
            observer.disconnect();
            visibility.disconnect();
            if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
            if (videoFrame !== undefined) video?.cancelVideoFrameCallback?.(videoFrame);
            if (video) {
                // Detach before resetting the decoder so cleanup cannot paint a blank frame.
                video.remove();
                video.pause();
                video.removeAttribute("src");
                video.load();
            }
            if (stopCurrentPreview === cancel) stopCurrentPreview = undefined;
            if (stop === cancel) stop = undefined;
        };
        const delay = setTimeout(() => {
            // Explicit playback wins over an incidental hover.
            if (Array.from(document.querySelectorAll("video, audio")).some((media) => !(media as HTMLMediaElement).paused)) {
                cancel();
                return;
            }
            void resolveSource().then((src) => {
                if (disposed) return;
                if (!src || !element.isConnected || document.hidden) { cancel(); return; }
                video = document.createElement("video");
                video.muted = true;
                video.playsInline = true;
                video.preload = "metadata";
                video.className = "pointer-events-none absolute inset-0 size-full rounded-[var(--node-radius)] bg-black object-contain";
                // Keep the existing poster underneath until the decoder presents a frame.
                // Opacity (not display:none) lets the video keep participating in rendering.
                video.style.opacity = "0";
                video.setAttribute("aria-hidden", "true");
                video.dataset.canvasHoverPreview = "true";
                video.addEventListener("ended", cancel, { signal: listeners.signal });
                video.addEventListener("error", cancel, { signal: listeners.signal });
                video.addEventListener("timeupdate", () => {
                    if (video && video.currentTime >= VIDEO_HOVER_PREVIEW_MS / 1000) cancel();
                }, { signal: listeners.signal });
                video.addEventListener("playing", () => {
                    if (!playbackTimer) playbackTimer = setTimeout(cancel, VIDEO_HOVER_PREVIEW_MS);
                }, { signal: listeners.signal });
                const reveal = () => {
                    if (!disposed && video && element.isConnected && !document.hidden) video.style.opacity = "1";
                };
                if (typeof video.requestVideoFrameCallback === "function") {
                    videoFrame = video.requestVideoFrameCallback(() => {
                        videoFrame = undefined;
                        reveal();
                    });
                } else {
                    // Older browsers expose decoded data, not presentation. Allow a paint
                    // between two RAFs before revealing; playing alone is not frame readiness.
                    const revealDecodedFrame = () => {
                        if (disposed || !video || video.readyState < 2 || video.paused
                            || animationFrame !== undefined || video.style.opacity === "1") return;
                        animationFrame = requestAnimationFrame(() => {
                            animationFrame = undefined;
                            if (disposed) return;
                            animationFrame = requestAnimationFrame(() => {
                                animationFrame = undefined;
                                if (video && video.readyState >= 2 && !video.paused) reveal();
                            });
                        });
                    };
                    video.addEventListener("loadeddata", revealDecodedFrame, { signal: listeners.signal });
                    video.addEventListener("playing", revealDecodedFrame, { signal: listeners.signal });
                }
                video.src = src;
                element.appendChild(video);
                void video.play().catch(cancel);
            }).catch(cancel);
        }, VIDEO_HOVER_DELAY_MS);
        // Bound stalled network/decoder sessions as well as actual playback.
        const deadline = setTimeout(cancel, 8000);
        stop = cancel;
        stopCurrentPreview = cancel;
        visibility.observe(element);
        if (viewport) observer.observe(viewport, { attributes: true, attributeFilter: ["data-canvas-viewport-interacting"] });
        for (const type of ["pointerdown", "wheel", "keydown", "blur"] as const) {
            window.addEventListener(type, cancel, { capture: true, passive: true, signal: listeners.signal });
        }
        document.addEventListener("visibilitychange", cancel, { signal: listeners.signal });
        document.addEventListener("play", (event) => { if (event.target !== video) cancel(); }, { capture: true, signal: listeners.signal });
    };
    const leave = () => stop?.();
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointercancel", leave);
    return () => {
        leave();
        element.removeEventListener("pointerenter", enter);
        element.removeEventListener("pointerleave", leave);
        element.removeEventListener("pointercancel", leave);
    };
}
