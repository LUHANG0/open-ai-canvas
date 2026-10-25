import { videoDurationOptions, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import { isVideoResolutionMatch } from "@/lib/video-generation-options";

// Only the complete, known three-part shorthand is eligible for deduplication.
// Free prose and any disagreement with the structured contract remain visible.
export function modelPickerVideoDescription(description: string | undefined, references: { maxImages?: number; maxVideos?: number; maxAudios?: number }, profile?: VideoCapabilityConfig) {
    const text = description?.trim() || "";
    const match = text.match(/^(\d)(\d)(\d)\s*[,，]\s*(\d+(?:p|k)?(?:\s*\/\s*\d+(?:p|k)?)*)\s*[,，]\s*(\d+)(?:\s*[-–~]\s*(\d+))?\s*(?:s|秒)$/i);
    if (!match || !profile) return text;
    if ([references.maxImages || 0, references.maxVideos || 0, references.maxAudios || 0].some((count, index) => count !== Number(match[index + 1]))) return text;
    const resolutions = match[4].split("/").map((value) => value.trim());
    if (resolutions.length !== profile.resolutions.length || !resolutions.every((value) => profile.resolutions.some((supported) => isVideoResolutionMatch(value, supported)))) return text;
    const durations = videoDurationOptions(profile);
    if (!durations.length || profile.durationSupported === false) return text;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    // The legacy single duration denotes the upper limit, as does the admin shorthand.
    const matchesDuration = match[6] ? Number(match[5]) === min && Number(match[6]) === max : Number(match[5]) === max;
    return matchesDuration ? "" : text;
}
