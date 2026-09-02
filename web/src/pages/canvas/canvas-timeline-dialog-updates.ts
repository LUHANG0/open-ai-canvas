import { syncNodeSubtitlesToTimeline } from "@/lib/timeline/timeline-build";
import type { CanvasNodeMetadata } from "@/types/canvas";
import type { TimelineProject } from "@/types/timeline";

export function syncSavedCanvasSubtitles(timeline: TimelineProject | null | undefined, nodeId: string, patch: Partial<CanvasNodeMetadata>): TimelineProject | null {
    if (!timeline) return null;
    return syncNodeSubtitlesToTimeline(timeline, nodeId, patch.subtitleEntries || []);
}
