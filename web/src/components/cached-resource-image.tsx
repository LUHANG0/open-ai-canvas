import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from "react";

import { resourceIdFromStorageKey, type ResourceAccessVariant } from "@/services/api/resources";
import { getActiveUserScope } from "@/lib/user-scope";
import { useCanvasMediaImage } from "@/components/canvas/use-canvas-media-image";
import type { CanvasImageSource } from "@/services/canvas-image-loader";

type CachedResourceImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
    storageKey?: string;
    src?: string;
    fallback?: ReactNode;
    loadingFallback?: ReactNode;
    eager?: boolean;
    variant?: ResourceAccessVariant;
    retentionKey?: string;
    sourceFallback?: CanvasImageSource;
};

/** Resource display stays on authorized delivery URLs; byte/blob storage is not a display cache. */
export function CachedResourceImage({ storageKey, src = "", fallback = null, loadingFallback = fallback, eager = false, variant = "original", retentionKey, sourceFallback, onError, ...props }: CachedResourceImageProps) {
    const resourceId = resourceIdFromStorageKey(storageKey);
    const remoteResource = Boolean(resourceId);
    const scope = getActiveUserScope();
    const identity = `${scope}:${resourceId || storageKey || src}:${variant}`;
    const retentionIdentity = retentionKey ? `${scope}:${retentionKey}` : `${scope}:${resourceId || storageKey || src}`;
    const targetRef = useRef<HTMLSpanElement>(null);
    const [nearViewport, setNearViewport] = useState(eager || !remoteResource);
    const pendingError = useRef<{ identity: string; event: React.SyntheticEvent<HTMLImageElement, Event> } | null>(null);
    const media = useCanvasMediaImage({ identity, retentionKey: retentionIdentity, storageKey, src, variant, fallbackSource: sourceFallback, thumbnailFallback: "original", enabled: eager || !remoteResource || nearViewport,
        onPrepared: () => { pendingError.current = null; },
        onFailure: () => {
            const error = pendingError.current;
            pendingError.current = null;
            if (error?.identity === identity) onError?.(error.event);
        },
    });

    useEffect(() => {
        if (!remoteResource || eager) {
            setNearViewport(true);
            return;
        }
        const image = targetRef.current;
        if (!image || typeof IntersectionObserver === "undefined") {
            setNearViewport(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setNearViewport(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "240px" },
        );
        observer.observe(image);
        return () => observer.disconnect();
    }, [eager, remoteResource]);

    const handleImgError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        pendingError.current = { identity, event };
        media.imageError();
    };
    if (media.failed && !media.src && fallback) return <>{fallback}</>;
    if (!remoteResource) return <img {...props} decoding={retentionKey ? "sync" : props.decoding} src={media.src || undefined} onError={handleImgError} />;
    return (
        <span ref={targetRef} className="cached-resource-image-shell">
            {media.src ? <img {...props} decoding={retentionKey ? "sync" : props.decoding} src={media.src} onError={handleImgError} /> : media.failed ? fallback : loadingFallback}
        </span>
    );
}
