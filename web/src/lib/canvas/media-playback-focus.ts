type FocusKind = "preview" | "explicit";
let focus: { owner: object; kind: FocusKind; pause: () => void } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
export function subscribeMediaPlaybackFocus(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Registered app media share one audible owner, including detached audio elements. */
export function claimMediaPlayback(owner: object, kind: FocusKind, pause: () => void) {
    if (focus && focus.owner !== owner && kind === "preview" && focus.kind === "explicit") return false;
    const changed = focus?.owner !== owner || focus?.kind !== kind;
    if (focus?.owner !== owner) {
        const previous = focus;
        focus = null;
        previous?.pause();
    }
    focus = { owner, kind, pause };
    if (changed) notify();
    return true;
}
export function releaseMediaPlayback(owner: object) {
    if (focus?.owner !== owner) return;
    focus = null;
    notify();
}
export function pauseFocusedMedia() {
    const previous = focus;
    focus = null;
    previous?.pause();
    if (previous) notify();
}
