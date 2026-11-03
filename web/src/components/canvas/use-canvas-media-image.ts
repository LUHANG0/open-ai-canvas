import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { getActiveUserScope } from "@/lib/user-scope";
import { useImagePresentationRetention } from "@/lib/canvas/canvas-image-presentation";
import { getImagePresentation, forgetImagePresentation, rememberImagePresentation, isCanvasImageActive, subscribeCanvasImageActivity } from "@/services/canvas-image-loader";
import { peekCanvasMediaAccess, prepareCanvasMedia, type CanvasMediaCandidate } from "@/services/canvas-media-source";
import type { ResourceAccessVariant } from "@/services/api/resources";
import type { CanvasImageSource } from "@/services/canvas-image-loader";

type MediaOptions = {
    identity: string;
    retentionKey: string;
    storageKey?: string;
    src: string;
    variant: ResourceAccessVariant;
    fallbackSource?: CanvasImageSource;
    preferredSource?: CanvasImageSource;
    thumbnailFallback?: "none" | "original";
    enabled: boolean;
    sourceError?: boolean;
    onPrepared?: (image: HTMLImageElement, candidate: CanvasMediaCandidate) => void;
    onFailure?: () => void;
};

/** Both image surfaces use the same snapshot, cancellation, renewal and presentation handoff. */
export function useCanvasMediaImage(options: MediaOptions) {
    const { identity, retentionKey, storageKey, src, variant, preferredSource, fallbackSource, thumbnailFallback, enabled, sourceError = false } = options;
    const scope = getActiveUserScope();
    const presentationKey = useMemo(() => JSON.stringify([scope, storageKey || "", retentionKey]), [scope, storageKey, retentionKey]);
    const access = useMemo(() => (storageKey?.startsWith("resource:") ? peekCanvasMediaAccess(storageKey, variant) : undefined), [scope, storageKey, variant, src]);
    const snapshot = getImagePresentation(presentationKey, access?.source.src || (storageKey?.startsWith("resource:") ? "" : src));
    const [displayed, setDisplayed] = useState<{ key: string; src: string; image?: HTMLImageElement }>(() => ({ key: presentationKey, src: snapshot }));
    const [state, setState] = useState({ identity, preparing: false, failed: false, activitySrc: "" });
    const [retry, setRetry] = useState({ identity, attempt: 0 });
    const attempt = retry.identity === identity ? retry.attempt : 0;
    const currentRef = useRef(options);
    currentRef.current = options;
    const visibleSrc = (displayed.key === presentationKey ? displayed.src : "") || snapshot;
    useImagePresentationRetention(presentationKey, visibleSrc, displayed.key === presentationKey ? displayed.image : undefined);
    const activitySrc = state.identity === identity ? state.activitySrc : "";
    const subscribe = useCallback((listener: () => void) => subscribeCanvasImageActivity(activitySrc, listener), [activitySrc, scope]);
    const getActive = useCallback(() => isCanvasImageActive(activitySrc), [activitySrc, scope]);
    const downloading = useSyncExternalStore(subscribe, getActive, () => false);

    useEffect(() => {
        if (!enabled && !attempt) return;
        if (!src && !storageKey) return;
        const controller = new AbortController();
        const isCurrent = () => !controller.signal.aborted && scope === getActiveUserScope() && currentRef.current.identity === identity && currentRef.current.retentionKey === retentionKey;
        setState({ identity, preparing: true, failed: false, activitySrc: "" });
        void prepareCanvasMedia({
            storageKey,
            src,
            variant,
            preferredSource,
            fallbackSource,
            thumbnailFallback,
            forceRefresh: attempt > 0,
            signal: controller.signal,
            onPreparing: (activitySrc) => {
                if (isCurrent()) setState({ identity, preparing: true, failed: false, activitySrc });
            },
        })
            .then(({ image, ...candidate }) => {
                if (!isCurrent()) return;
                currentRef.current.onPrepared?.(image, candidate);
                rememberImagePresentation(presentationKey, candidate.source.src);
                setDisplayed({ key: presentationKey, src: candidate.source.src, image });
                setState({ identity, preparing: false, failed: false, activitySrc: "" });
            })
            .catch((error: unknown) => {
                if (!isCurrent()) return;
                if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
                    setState({ identity, preparing: false, failed: false, activitySrc: "" });
                    return;
                }
                setState({ identity, preparing: false, failed: true, activitySrc: "" });
                currentRef.current.onFailure?.();
            });
        return () => controller.abort();
    }, [identity, presentationKey, retentionKey, storageKey, src, variant, preferredSource, fallbackSource, thumbnailFallback, enabled, attempt, scope]);

    const failed = (sourceError && !attempt) || (state.identity === identity && state.failed);
    const retryLoad = () => setRetry({ identity, attempt: attempt + 1 });
    const imageError = () => {
        forgetImagePresentation(visibleSrc);
        setDisplayed({ key: presentationKey, src: "" });
        if (!attempt && (storageKey?.startsWith("resource:") || (storageKey?.startsWith("image:") && visibleSrc.startsWith("blob:")))) retryLoad();
        else {
            setState({ identity, preparing: false, failed: true, activitySrc: "" });
            currentRef.current.onFailure?.();
        }
    };
    return { src: visibleSrc, failed, preparing: state.identity === identity && state.preparing, downloading, retry: retryLoad, imageError };
}
