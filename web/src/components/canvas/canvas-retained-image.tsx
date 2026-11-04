import type { CanvasTheme } from "@/lib/canvas-theme";
import { CanvasOriginalImageFeedback } from "./canvas-original-image-feedback";
import { useCanvasMediaImage } from "./use-canvas-media-image";
import type { CanvasImageSource } from "@/services/canvas-image-loader";

/** Same-media source renewal keeps the existing image while the target uses the shared queue. */
export function RetainedCanvasImage({ identity, retentionKey = identity, src, preferredSource, storageKey, variant = "original", measuredVariant = variant, sourceError = false, originalSize, completed = false, bytes, alt, fitToImage, className, loading, theme }: {
    identity: string;
    retentionKey?: string;
    src: string;
    preferredSource?: CanvasImageSource;
    storageKey?: string;
    variant?: "original" | "thumbnail";
    measuredVariant?: "original" | "thumbnail" | "playback";
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
    const media = useCanvasMediaImage({ identity, retentionKey, storageKey, src, variant, preferredSource, enabled: Boolean(src), sourceError, onPrepared: (image, candidate) => {
        const size = { width: candidate.width || originalSize.width, height: candidate.height || originalSize.height };
        const actualVariant = storageKey?.startsWith("resource:") ? candidate.actualVariant : measuredVariant;
        if (actualVariant === "original" || (size.width && size.height)) fitToImage(image, size);
    } });
    const busy = !media.failed && (loading || media.preparing || (!media.src && Boolean(src)));
    return (
        <>
            <img
                src={media.src || undefined}
                alt={alt || ""}
                decoding="sync"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onError={media.imageError}
                className={`absolute inset-0 ${className}`}
                style={{ visibility: media.src ? "visible" : "hidden" }}
            />
            {!media.src || media.failed ? <CanvasOriginalImageFeedback busy={busy} animating={media.downloading} failed={Boolean(media.failed)} completed={completed} hasPreview={Boolean(media.src)} width={originalSize.width} height={originalSize.height} bytes={bytes} variant={variant} theme={theme} onRetry={media.retry} /> : null}
        </>
    );
}
