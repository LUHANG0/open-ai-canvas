// Only the hovered node owns a decoder; pending hover work shares the same lease.
let stopCurrentPreview: (() => void) | undefined;
export const VIDEO_HOVER_DELAY_MS = 350;
export const VIDEO_HOVER_RESUME_MS = 5000;

export function bindCanvasVideoHoverPreview(element: HTMLElement, resolveSource: () => Promise<string>) {
    let stop: (() => void) | undefined;
    let resumeTime = 0;
    let leftAt = 0;
    const enter = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || event.buttons || document.hidden
            || window.matchMedia("(prefers-reduced-motion: reduce)").matches
            || element.closest('[data-canvas-viewport-interacting="true"]')) return;
        stopCurrentPreview?.();
        let disposed = false;
        let video: HTMLVideoElement | undefined;
        let completed = false;
        let resumePending = resumeTime > 0 && Date.now() - leftAt <= VIDEO_HOVER_RESUME_MS;
        const seekTime = resumePending ? resumeTime : 0;
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
            delete element.dataset.hoverPlaying;
            listeners.abort();
            observer.disconnect();
            visibility.disconnect();
            if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
            if (videoFrame !== undefined) video?.cancelVideoFrameCallback?.(videoFrame);
            if (video) {
                resumeTime = completed ? 0 : resumePending ? seekTime : Number.isFinite(video.currentTime) ? video.currentTime : 0;
                leftAt = Date.now();
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
                video.addEventListener("ended", () => { completed = true; cancel(); }, { signal: listeners.signal });
                video.addEventListener("error", () => { completed = true; cancel(); }, { signal: listeners.signal });
                video.addEventListener("loadedmetadata", () => {
                    if (!resumePending) return;
                    if (Number.isFinite(video!.duration) && seekTime >= video!.duration) { resumePending = false; return; }
                    video!.currentTime = seekTime;
                }, { signal: listeners.signal });
                video.addEventListener("seeked", () => {
                    resumePending = false;
                    if (typeof video?.requestVideoFrameCallback === "function") {
                        videoFrame = video.requestVideoFrameCallback(reveal);
                    }
                }, { signal: listeners.signal });
                const reveal = () => {
                    if (!disposed && video && !resumePending && element.isConnected && !document.hidden) {
                        clearTimeout(deadline);
                        video.style.opacity = "1";
                        element.dataset.hoverPlaying = "true";
                    }
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
                    video.addEventListener("seeked", revealDecodedFrame, { signal: listeners.signal });
                }
                video.src = src;
                element.appendChild(video);
                void video.play().catch(cancel);
            }).catch(cancel);
        }, VIDEO_HOVER_DELAY_MS);
        // Bound startup only. Once a frame is presented, play through the full video.
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
