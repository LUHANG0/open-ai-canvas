import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { getActiveUserScope } from "@/lib/user-scope";
import { getResourceAccess, resolveResourceAccessURL, resourceIdFromStorageKey } from "@/services/api/resources";
import { isCanvasImageActive, prepareCanvasImage, subscribeCanvasImageActivity } from "@/services/canvas-image-loader";
import { CanvasOriginalImageFeedback } from "./canvas-original-image-feedback";

type DisplayedImage = { identity: string; retentionKey: string; src: string };

/** Keep a decoded preview for this node and account until its next original is ready. */
export function RetainedCanvasImage({ identity, retentionKey = identity, src, storageKey, sourceError = false, originalSize, completed = false, bytes, alt, fitToImage, className, loading, theme }: {
    identity: string;
    retentionKey?: string;
    src: string;
    storageKey?: string;
    sourceError?: boolean;
    originalSize: { width?: number; height?: number };
    completed?: boolean;
    bytes?: number;
    alt?: string;
    fitToImage: (image: HTMLImageElement, size?: { width?: number; height?: number }) => void;
    className: string;
    loading: boolean;
    theme: CanvasTheme;
}) {
    const [displayed, setDisplayed] = useState<DisplayedImage | null>(null);
    const [preparing, setPreparing] = useState(false);
    const [failure, setFailure] = useState<{ identity: string; src: string; attempt: number } | null>(null);
    const [retry, setRetry] = useState({ identity, attempt: 0 });
    const [preparation, setPreparation] = useState({ identity: "", src: "" });
    const activitySrc = preparation.identity === identity ? preparation.src : "";
    const subscribeActivity = useCallback((listener: () => void) => subscribeCanvasImageActivity(activitySrc, listener), [activitySrc, identity]);
    const activeSnapshot = useCallback(() => isCanvasImageActive(activitySrc), [activitySrc, identity]);
    const downloading = useSyncExternalStore(subscribeActivity, activeSnapshot, () => false);
    const attempt = retry.identity === identity ? retry.attempt : 0;
    const displayedRef = useRef(displayed);
    displayedRef.current = displayed;
    const currentRef = useRef({ identity, retentionKey, src, storageKey, originalSize, fitToImage });
    currentRef.current = { identity, retentionKey, src, storageKey, originalSize, fitToImage };
    const originalWidth = originalSize.width;
    const originalHeight = originalSize.height;
    const visibleSrc = displayed?.retentionKey === retentionKey ? displayed.src : "";
    const currentImageReady = displayed?.identity === identity && displayed.retentionKey === retentionKey;
    const failed = (sourceError && !attempt) || (failure?.identity === identity && failure.src === src && failure.attempt === attempt);

    useEffect(() => {
        const controller = new AbortController();
        const scope = getActiveUserScope();
        const target = currentRef.current;
        setFailure(null);
        if ((!target.src && !attempt) || (!attempt && displayedRef.current?.identity === identity && displayedRef.current.retentionKey === retentionKey && displayedRef.current.src === target.src)) {
            setPreparing(false);
            return () => controller.abort();
        }
        setPreparing(true);
        const isCurrent = () => !controller.signal.aborted && getActiveUserScope() === scope && currentRef.current.identity === identity && currentRef.current.src === target.src && currentRef.current.retentionKey === retentionKey;
        const freshOriginal = async () => {
            const access = await getResourceAccess(target.storageKey, "display", "original", "", { forceRefresh: true });
            return { url: resolveResourceAccessURL(access.url), size: { width: access.originalWidth || target.originalSize.width, height: access.originalHeight || target.originalSize.height } };
        };
        const load = async () => {
            let candidate = { url: target.src, size: target.originalSize };
            const remote = Boolean(resourceIdFromStorageKey(target.storageKey));
            if (attempt && remote) candidate = await freshOriginal();
            if (!isCurrent()) return;
            const prepare = (url: string) => {
                if (isCurrent()) setPreparation({ identity, src: url });
                return prepareCanvasImage(url, controller.signal);
            };
            let image: HTMLImageElement;
            try {
                image = await prepare(candidate.url);
            } catch (error) {
                if (!isCurrent() || !remote || attempt) throw error;
                const refreshed = await freshOriginal();
                if (!isCurrent() || !refreshed.url || refreshed.url === candidate.url) throw error;
                candidate = refreshed;
                image = await prepare(candidate.url);
            }
            if (!isCurrent()) return;
            currentRef.current.fitToImage(image, candidate.size);
            setFailure(null);
            setDisplayed({ identity, retentionKey, src: candidate.url });
        };
        void load().catch(() => {
            if (isCurrent()) setFailure({ identity, src: target.src, attempt });
        }).finally(() => {
            if (isCurrent()) setPreparing(false);
        });
        return () => controller.abort();
    }, [identity, retentionKey, src, storageKey, attempt]);

    const busy = !failed && (loading || preparing || (!currentImageReady && Boolean(src)));
    return (
        <>
            <img
                src={visibleSrc || undefined}
                alt={alt || ""}
                // The queue has already decoded this candidate. Synchronous presentation
                // prevents a blank raster frame while the canvas world is zooming.
                decoding="sync"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onError={() => {
                    if (!visibleSrc) return;
                    setDisplayed((current) => current?.src === visibleSrc ? null : current);
                    if (displayed?.identity === identity && !preparing) setFailure({ identity, src, attempt });
                }}
                className={`absolute inset-0 ${className}`}
                style={{ visibility: visibleSrc ? "visible" : "hidden" }}
            />
            {busy || failed || !visibleSrc ? <CanvasOriginalImageFeedback busy={busy} animating={downloading} failed={Boolean(failed)} completed={completed} hasPreview={Boolean(visibleSrc)} width={originalWidth} height={originalHeight} bytes={bytes} theme={theme} onRetry={() => setRetry({ identity, attempt: attempt + 1 })} /> : null}
        </>
    );
}
