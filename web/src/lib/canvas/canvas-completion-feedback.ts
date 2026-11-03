import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export const CANVAS_COMPLETION_FEEDBACK_MS = 2000;
export type CanvasCompletionFeedback = { identity: number; startedAt: number };
type TextResult = { content: string; rows: NonNullable<CanvasNodeMetadata["storyboard"]>["rows"] | undefined };
type ResultValue = string | TextResult;
type Observation = { source: CanvasNodeData; status: string | undefined; media: ResultValue; taskId: string; baselineMedia: ResultValue; appliedTaskId: string; appliedMedia: ResultValue | undefined; feedback: CanvasCompletionFeedback | null };

const appliedTextResults = new WeakMap<CanvasNodeMetadata, TextResult>();

function isMediaType(type: string) {
    return type === "image" || type === "video" || type === "audio";
}

/** Local presentation proof for text/storyboard producers, not persistent data.
 * Metadata identity survives the state writer's timestamp-only node cloning. */
export function markCanvasTextResultApplied(node: CanvasNodeData): CanvasNodeData {
    if (node.metadata && !isMediaType(node.type)) {
        appliedTextResults.set(node.metadata, { content: node.metadata.content || "", rows: node.metadata.storyboard?.rows });
    }
    return node;
}

function mediaIdentity(node: CanvasNodeData) {
    const meta = node.metadata;
    if (meta?.storageKey) return meta.storageKey;
    const content = meta?.content || "";
    if (!isMediaType(node.type) || !/^(https?:\/\/|\/)/.test(content)) return content;
    // Authentication refreshes do not replace the object. Preserve all other
    // query parameters: e.g. a query-selected result is still a different result.
    try {
        const url = new URL(content, "http://canvas.local");
        for (const key of [...url.searchParams.keys()]) {
            if (/^(x-amz-|x-goog-)/i.test(key) || /^(signature|expires|ossaccesskeyid|awsaccesskeyid|googleaccessid|security-token)$/i.test(key)) url.searchParams.delete(key);
        }
        url.hash = "";
        url.searchParams.sort();
        return url.href;
    } catch {
        // Bad source handling belongs to the media node, never the page observer.
        return content;
    }
}

function sameFields(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => sameFields(value, right[index]));
    if (Array.isArray(right)) return false;
    const a = left as Record<string, unknown>,
        b = right as Record<string, unknown>;
    for (const key in a) {
        if (!Object.hasOwn(b, key) || !sameFields(a[key], b[key])) return false;
    }
    for (const key in b) if (!Object.hasOwn(a, key)) return false;
    return true;
}

function sameResult(left: ResultValue | undefined, right: ResultValue): boolean {
    if (left === right) return true;
    return typeof left === "object" && typeof right === "object" && left.content === right.content && sameFields(left.rows, right.rows);
}

/** Session-local presentation state. Never serialized, never a durable-save signal. */
export class CanvasCompletionFeedbackLedger {
    private initialized = false;
    private feedbackSequence = 0;
    private observations = new Map<string, Observation>();
    private listeners = new Set<() => void>();

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    get(nodeId: string): CanvasCompletionFeedback | null {
        return this.observations.get(nodeId)?.feedback ?? null;
    }

    observe(nodes: readonly CanvasNodeData[], now: number) {
        let changed = false;
        const retained = new Set<string>();
        for (const node of nodes) {
            retained.add(node.id);
            const previous = this.observations.get(node.id);
            if (previous?.source === node) continue;
            const meta = node.metadata;
            const taskId = meta?.taskId || "";
            const textResult = meta ? appliedTextResults.get(meta) : undefined;
            const isMedia = isMediaType(node.type);
            // Keep references to long source/body strings. Never serialize them
            // into a per-node key; React only receives a bounded session sequence.
            const media = isMedia ? mediaIdentity(node) : (textResult ?? (previous?.taskId === taskId ? previous.media : { content: meta?.content || "", rows: meta?.storyboard?.rows }));
            const baselineMedia = previous?.taskId === taskId ? previous.baselineMedia : (previous?.media ?? media);
            const record = meta?.resultRecord;
            const boundRecord = Boolean(record && record.taskId === taskId && record.mediaKey === (meta?.storageKey || meta?.content));
            // attach-node is stamped by the materialized-result consumer, not
            // by upstream status polling. Extra effects never change identity.
            const attached = Boolean(taskId && meta?.generationEffectKeys?.some((key) => key.startsWith(`attach-node:${taskId}:`)));
            const previouslyApplied = previous?.appliedTaskId === taskId && sameResult(previous.appliedMedia, media);
            const applied = !taskId || textResult !== undefined || boundRecord || attached || previouslyApplied || (isMedia && !sameResult(media, baselineMedia));
            const success = meta?.status === "success" && (applied || !this.initialized);
            const transitioned = previous ? previous.status !== "success" || previous.taskId !== taskId || !sameResult(previous.media, media) : Boolean(taskId || record);
            const feedback = success ? (this.initialized && transitioned ? { identity: ++this.feedbackSequence, startedAt: now } : (previous?.feedback ?? null)) : null;
            if (feedback !== previous?.feedback) changed = true;
            this.observations.set(node.id, {
                source: node,
                status: success ? "success" : meta?.status === "success" ? "pending-result" : meta?.status,
                media,
                taskId,
                baselineMedia,
                // The first loaded success is historical, but can establish the
                // applied identity so bookkeeping/readback does not replay it.
                appliedTaskId: success ? taskId : previous?.appliedTaskId || "",
                appliedMedia: success ? media : previous?.appliedMedia,
                feedback,
            });
        }
        for (const id of this.observations.keys()) {
            if (retained.has(id)) continue;
            if (this.observations.get(id)?.feedback) changed = true;
            this.observations.delete(id);
        }
        this.initialized = true;
        if (changed) this.listeners.forEach((listener) => listener());
    }
}
