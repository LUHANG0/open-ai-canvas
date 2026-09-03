const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export const PROJECT_DELIVERY_FALLBACK_SOURCE_BUDGET = 256 * MIB;
export const PROJECT_DELIVERY_MIN_SOURCE_BUDGET = 128 * MIB;
export const PROJECT_DELIVERY_MAX_SOURCE_BUDGET = 512 * MIB;

const DEVICE_MEMORY_SOURCE_RATIO = 0.08;
const WARNING_RATIO = 0.7;
// 源 Blob、FFmpeg 文件系统、MP4 输出和 ZIP 编码会在不同阶段重叠驻留；按约 5 倍源体积预留峰值空间。
const PEAK_MEMORY_MULTIPLIER = 5;
const RUNTIME_OVERHEAD_BYTES = 64 * MIB;

export type ProjectDeliveryCapacityLevel = "safe" | "warning" | "blocked" | "unknown";

export type ProjectDeliveryCapacity = {
    sourceBytes?: number;
    knownResourceCount: number;
    unknownResourceCount: number;
    sourceBudgetBytes: number;
    estimatedPeakBytes?: number;
    level: ProjectDeliveryCapacityLevel;
};

export function projectDeliverySourceBudget(deviceMemoryGB?: number) {
    if (!Number.isFinite(deviceMemoryGB) || Number(deviceMemoryGB) <= 0) return PROJECT_DELIVERY_FALLBACK_SOURCE_BUDGET;
    const deviceAwareBudget = Math.floor(Number(deviceMemoryGB) * GIB * DEVICE_MEMORY_SOURCE_RATIO);
    return Math.min(PROJECT_DELIVERY_MAX_SOURCE_BUDGET, Math.max(PROJECT_DELIVERY_MIN_SOURCE_BUDGET, deviceAwareBudget));
}

export function inspectProjectDeliveryCapacity(resourceSizes: Array<number | undefined>, sourceBudgetBytes: number): ProjectDeliveryCapacity {
    const knownSizes = resourceSizes.filter((size): size is number => Number.isFinite(size) && Number(size) > 0);
    const unknownResourceCount = resourceSizes.length - knownSizes.length;
    const knownBytes = knownSizes.reduce((total, size) => total + size, 0);
    const complete = unknownResourceCount === 0;
    const level = knownBytes > sourceBudgetBytes
        ? "blocked"
        : !complete
            ? "unknown"
            : knownBytes >= sourceBudgetBytes * WARNING_RATIO
                ? "warning"
                : "safe";
    return {
        sourceBytes: complete ? knownBytes : undefined,
        knownResourceCount: knownSizes.length,
        unknownResourceCount,
        sourceBudgetBytes,
        estimatedPeakBytes: complete ? knownBytes * PEAK_MEMORY_MULTIPLIER + RUNTIME_OVERHEAD_BYTES : undefined,
        level,
    };
}

export function formatProjectDeliveryBytes(bytes: number) {
    if (bytes < MIB) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
    if (bytes < GIB) return `${Math.round(bytes / MIB)} MB`;
    return `${Math.round((bytes / GIB) * 10) / 10} GB`;
}

export function projectDeliveryCapacityError(sourceBytes: number, sourceBudgetBytes: number) {
    return `镜头视频共约 ${formatProjectDeliveryBytes(sourceBytes)}，超过当前浏览器本机打包的安全上限 ${formatProjectDeliveryBytes(sourceBudgetBytes)}。请拆分章节后再导出。`;
}
