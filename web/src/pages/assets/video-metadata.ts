export type LoadedVideoMetadata = {
    width: number;
    height: number;
    durationMs?: number;
};

type StoredVideoMetadata = LoadedVideoMetadata & {
    [key: string]: unknown;
};

export function mergeLoadedVideoMetadata<T extends StoredVideoMetadata>(current: T, loaded: LoadedVideoMetadata): T | null {
    const width = positiveInteger(current.width) || positiveInteger(loaded.width);
    const height = positiveInteger(current.height) || positiveInteger(loaded.height);
    const durationMs = positiveInteger(current.durationMs) || positiveInteger(loaded.durationMs);
    if (!width || !height) return null;
    if (width === current.width && height === current.height && durationMs === current.durationMs) return null;
    return { ...current, width, height, ...(durationMs ? { durationMs } : {}) };
}

export function formatAssetDimensions(width: number, height: number) {
    const validWidth = positiveInteger(width);
    const validHeight = positiveInteger(height);
    return validWidth && validHeight ? `${validWidth}x${validHeight}` : "尺寸待识别";
}

function positiveInteger(value?: number) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
