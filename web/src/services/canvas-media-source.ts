import { getActiveUserScope } from "@/lib/user-scope";
import { getResourceAccess, peekResourceAccess, resolveResourceAccessURL, resourceAccessCacheExpiry, resourceIdFromStorageKey, type ResourceAccess, type ResourceAccessVariant } from "@/services/api/resources";
import { registerCanvasImageSource, canvasImageSourceFor, prepareCanvasImage, type CanvasImagePriority, type CanvasImageSource } from "@/services/canvas-image-loader";
import { resolveImageUrl } from "@/services/image-storage";

export type CanvasMediaCandidate = { source: CanvasImageSource; width?: number; height?: number; actualVariant: ResourceAccessVariant };

function describe(access: ResourceAccess): CanvasMediaCandidate {
    const url = resolveResourceAccessURL(access.url);
    return {
        source: registerCanvasImageSource(url, access.resourceId, access.actualVariant, resourceAccessCacheExpiry(access), { requestedVariant: access.requestedVariant, originalWidth: access.originalWidth, originalHeight: access.originalHeight }),
        width: access.originalWidth,
        height: access.originalHeight,
        actualVariant: access.actualVariant,
    };
}

export function peekCanvasMediaAccess(storageKey: string | undefined, variant: ResourceAccessVariant) {
    const access = peekResourceAccess(storageKey, variant);
    return access && access.resourceId === resourceIdFromStorageKey(storageKey) && access.requestedVariant === variant ? describe(access) : undefined;
}

export async function getCanvasMediaAccess(storageKey: string | undefined, variant: ResourceAccessVariant, forceRefresh = false) {
    const scope = getActiveUserScope();
    const access = await getResourceAccess(storageKey, "display", variant, "", { forceRefresh });
    if (scope !== getActiveUserScope()) throw new DOMException("媒体访问已因账号切换取消", "AbortError");
    if (access.resourceId !== resourceIdFromStorageKey(storageKey) || access.requestedVariant !== variant) throw new Error("媒体访问描述与请求资源不匹配");
    return describe(access);
}

/** One bounded error protocol for images and persisted posters; always return the successful source. */
export async function prepareCanvasMedia({
    storageKey,
    src,
    variant,
    preferredSource,
    fallbackSource,
    thumbnailFallback = "none",
    forceRefresh = false,
    signal,
    priority = 0,
    estimatedPixels,
    onPreparing,
}: {
    storageKey?: string;
    src: string;
    variant: ResourceAccessVariant;
    preferredSource?: CanvasImageSource;
    fallbackSource?: CanvasImageSource;
    thumbnailFallback?: "none" | "original";
    forceRefresh?: boolean;
    signal: AbortSignal;
    priority?: CanvasImagePriority;
    estimatedPixels?: number;
    onPreparing?: (src: string) => void;
}) {
    const scope = getActiveUserScope();
    const current = (error?: unknown) => {
        if (error && typeof error === "object" && "name" in error && error.name === "AbortError") throw error;
        if (signal.aborted || scope !== getActiveUserScope()) throw new DOMException("媒体准备已取消", "AbortError");
    };
    current();
    const attempted = new Set<string>();
    const prepare = async (candidate: CanvasMediaCandidate) => {
        current();
        if (!candidate.source.src) throw new Error("图片地址为空");
        onPreparing?.(candidate.source.src);
        attempted.add(candidate.source.src);
        const image = await prepareCanvasImage(candidate.source, signal, undefined, priority, estimatedPixels);
        current();
        return { ...candidate, image };
    };
    const resourceId = resourceIdFromStorageKey(storageKey);
    const remote = Boolean(resourceId);
    if (!forceRefresh && preferredSource && preferredSource.src === src && (preferredSource.resourceId || "") === (resourceId || "") && preferredSource.requestedVariant === variant) {
        try {
            return await prepare({ source: preferredSource, actualVariant: preferredSource.actualVariant, width: preferredSource.originalWidth, height: preferredSource.originalHeight });
        } catch (error) {
            current(error);
        }
    }
    if (!remote) {
        const url = storageKey?.startsWith("image:") ? (forceRefresh ? await resolveImageUrl(storageKey) : (await resolveImageUrl(storageKey, src)) || src) : src;
        current();
        return prepare({ source: registerCanvasImageSource(url), actualVariant: variant });
    }
    let firstError: unknown;
    let candidate: CanvasMediaCandidate | undefined;
    try {
        const known = !forceRefresh && src ? canvasImageSourceFor(src) : undefined;
        candidate =
            known && known.resourceId === resourceId && known.requestedVariant === variant && known.validUntil > Date.now()
                ? { source: known, actualVariant: known.actualVariant, width: known.originalWidth, height: known.originalHeight }
                : await getCanvasMediaAccess(storageKey, variant, forceRefresh);
        return await prepare(candidate);
    } catch (error) {
        current(error);
        firstError = error;
    }
    // One refresh per generation. A forced retry is not refreshed recursively.
    if (!forceRefresh) {
        try {
            candidate = await getCanvasMediaAccess(storageKey, variant, true);
            return await prepare(candidate);
        } catch (error) {
            current(error);
            firstError = error;
        }
    }
    if (variant === "thumbnail" && thumbnailFallback === "original") {
        try {
            return await prepare(await getCanvasMediaAccess(storageKey, "original"));
        } catch (error) {
            current(error);
            firstError = error;
        }
    }
    // Bare src is not proof of an independent fallback when a resource key is present.
    // Callers may supply a separately typed capability, never reclassify a lost registry entry.
    if (fallbackSource && !attempted.has(fallbackSource.src)) {
        return prepare({ source: fallbackSource, actualVariant: fallbackSource.actualVariant, width: fallbackSource.originalWidth, height: fallbackSource.originalHeight });
    }
    throw firstError;
}
