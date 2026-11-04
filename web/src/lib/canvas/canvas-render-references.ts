import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

function sameReference(a: CanvasResourceReference, b: CanvasResourceReference) {
    if (a === b) return true;
    const keys = Object.keys(a) as (keyof CanvasResourceReference)[];
    return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

/** Preserve every field's invalidation semantics; cache only the current render's references. */
export function retainCanvasResourceReferences(previous: readonly CanvasResourceReference[], next: CanvasResourceReference[]) {
    const byId = new Map(previous.map((reference) => [reference.id, reference]));
    const retained = next.map((reference) => {
        const old = byId.get(reference.id);
        return old && sameReference(old, reference) ? old : reference;
    });
    return previous.length === retained.length && retained.every((reference, index) => reference === previous[index]) ? (previous as CanvasResourceReference[]) : retained;
}

export function retainCanvasMentionReferenceMap(previous: ReadonlyMap<string, CanvasResourceReference[]>, next: Map<string, CanvasResourceReference[]>) {
    for (const [id, references] of next) {
        const old = previous.get(id);
        if (old) next.set(id, retainCanvasResourceReferences(old, references));
    }
    return previous.size === next.size && [...next].every(([id, references]) => previous.get(id) === references) ? (previous as Map<string, CanvasResourceReference[]>) : next;
}
