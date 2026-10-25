import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router";

export const CREATION_ENTRY_PROMPT_LIMIT = 2000;
export type CreationEntry = { mode?: "image" | "video"; explore: boolean; prompt?: string };

export function readCreationEntry(search: string): CreationEntry | null {
    const params = new URLSearchParams(search);
    const mode = params.get("mode");
    const explore = params.get("view") === "explore";
    // Prompt is plain draft text, never a command or an automatic generation request.
    // Count Unicode code points so clipping does not leave half of an emoji behind.
    const prompt = Array.from((params.get("prompt") || "").trim()).slice(0, CREATION_ENTRY_PROMPT_LIMIT).join("");
    if (mode !== "image" && mode !== "video" && !explore && !prompt) return null;
    return { ...(mode === "image" || mode === "video" ? { mode } : {}), explore, ...(prompt ? { prompt } : {}) };
}

/** Entry links are consumed after local state is ready, never replayed over a draft. */
export function useCreationEntry({ ready, hasDraft, busy, onOpen, onBlocked }: {
    ready: boolean;
    hasDraft: boolean;
    busy: boolean;
    onOpen: (entry: CreationEntry) => void;
    onBlocked: () => void;
}) {
    const location = useLocation();
    const navigate = useNavigate();
    const handled = useRef<string | null>(null);

    useEffect(() => {
        const entry = readCreationEntry(location.search);
        const identity = `${location.key}:${location.search}`;
        if (!ready || !entry || handled.current === identity) return;
        handled.current = identity;
        if (hasDraft || busy) onBlocked();
        else onOpen(entry);

        const remaining = new URLSearchParams(location.search);
        if (entry.mode) remaining.delete("mode");
        if (entry.explore) remaining.delete("view");
        remaining.delete("prompt");
        const search = remaining.toString();
        navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace: true, state: location.state });
    }, [ready, hasDraft, busy, location, navigate, onOpen, onBlocked]);
}

/** Do not consume a scroll request while Suspense or the catalog is still loading. */
export function useExploreEntryScroll({ pending, ready, blocked, target, onSettled }: {
    pending: boolean;
    ready: boolean;
    blocked: boolean;
    target: RefObject<HTMLDivElement | null>;
    onSettled: () => void;
}) {
    useLayoutEffect(() => {
        if (!pending) return;
        if (blocked) { onSettled(); return; }
        if (!ready || !target.current) return;
        const frame = window.requestAnimationFrame(() => {
            target.current?.scrollIntoView({ block: "start", behavior: "auto" });
            target.current?.focus({ preventScroll: true });
            onSettled();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [pending, ready, blocked, target, onSettled]);
}
