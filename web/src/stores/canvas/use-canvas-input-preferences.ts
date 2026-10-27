import { useEffect } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { scopedStorageKey } from "@/lib/user-scope";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasToolMode } from "@/types/canvas";

export type CanvasInputPreferences = {
    blankDrag: "box-select" | "pan";
    mouseWheel: "zoom" | "pan";
    rememberTool: boolean;
};
export type CanvasInputTool = CanvasToolMode;

export const CANVAS_INPUT_PREFERENCES_KEY = "open_ai_canvas:canvas_input_preferences:v1";
export const DEFAULT_CANVAS_INPUT_PREFERENCES: Readonly<CanvasInputPreferences> = {
    blankDrag: "box-select",
    mouseWheel: "zoom",
    rememberTool: false,
};

function defaultTool(preferences: CanvasInputPreferences): CanvasToolMode {
    return preferences.blankDrag === "pan" ? "move" : "box-select";
}

function normalizePreferences(value: unknown): CanvasInputPreferences {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
        blankDrag: raw.blankDrag === "pan" ? "pan" : "box-select",
        mouseWheel: raw.mouseWheel === "pan" ? "pan" : "zoom",
        rememberTool: raw.rememberTool === true,
    };
}

function currentScope(): string | null {
    const { hydrated, user } = useUserStore.getState();
    // Session switching retains the old user until its async scope transition completes.
    // Never read active-user-scope here: it can already identify the next account.
    return hydrated ? user?.id || "guest" : null;
}

function readPreferences(scope: string) {
    let preferences = { ...DEFAULT_CANVAS_INPUT_PREFERENCES };
    let lastTool: CanvasToolMode | null = null;
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(scopedStorageKey(CANVAS_INPUT_PREFERENCES_KEY, scope)) || "null");
        if (value && typeof value === "object" && !Array.isArray(value)) {
            const raw = value as Record<string, unknown>;
            preferences = normalizePreferences(raw.preferences);
            if (raw.lastTool === "move" || raw.lastTool === "box-select") lastTool = raw.lastTool;
        }
    } catch {
        // Storage can be unavailable (privacy settings/quota) or contain invalid JSON.
        // Input remains usable in memory without writing a replacement during hydration.
    }
    return { preferences, lastTool };
}

type CanvasInputState = {
    scope: string | null;
    preferences: CanvasInputPreferences;
    canvasTool: CanvasToolMode;
    lastTool: CanvasToolMode | null;
    setCanvasTool: (tool: CanvasToolMode) => void;
    updatePreferences: (patch: Partial<CanvasInputPreferences>) => void;
    resetPreferences: () => void;
    initializeEntry: () => void;
};

function persistPreferences(state: CanvasInputState) {
    if (state.scope === null || typeof window === "undefined") return;
    try {
        window.localStorage.setItem(scopedStorageKey(CANVAS_INPUT_PREFERENCES_KEY, state.scope), JSON.stringify({
            preferences: state.preferences,
            lastTool: state.lastTool,
        }));
    } catch {
        // Keep the current account's working in-memory preferences if storage fails.
    }
}

// This store is intentionally absent from remote user-data sync and canvas snapshots.
export const canvasInputPreferencesStore = createStore<CanvasInputState>()((set, get) => ({
    scope: null,
    preferences: { ...DEFAULT_CANVAS_INPUT_PREFERENCES },
    canvasTool: "box-select",
    lastTool: null,
    setCanvasTool: (canvasTool) => {
        if (get().scope === null) return;
        set({ canvasTool, ...(get().preferences.rememberTool ? { lastTool: canvasTool } : {}) });
        if (get().preferences.rememberTool) persistPreferences(get());
    },
    updatePreferences: (patch) => {
        const state = get();
        if (state.scope === null) return;
        const preferences = normalizePreferences({ ...state.preferences, ...patch });
        const canvasTool = preferences.blankDrag !== state.preferences.blankDrag ? defaultTool(preferences) : state.canvasTool;
        set({ preferences, canvasTool, lastTool: preferences.rememberTool ? canvasTool : state.lastTool });
        persistPreferences(get());
    },
    resetPreferences: () => {
        const { scope } = get();
        if (scope === null) return;
        set({ preferences: { ...DEFAULT_CANVAS_INPUT_PREFERENCES }, canvasTool: "box-select", lastTool: null });
        try {
            window.localStorage.removeItem(scopedStorageKey(CANVAS_INPUT_PREFERENCES_KEY, scope));
        } catch {
            // Reset still takes effect for this session when storage is unavailable.
        }
    },
    initializeEntry: () => {
        const { scope, preferences, lastTool } = get();
        if (scope !== null) set({ canvasTool: preferences.rememberTool && lastTool ? lastTool : defaultTool(preferences) });
    },
}));

function synchronizeScope() {
    const scope = currentScope();
    if (canvasInputPreferencesStore.getState().scope === scope) return;
    const snapshot = scope !== null && typeof window !== "undefined"
        ? readPreferences(scope)
        : { preferences: { ...DEFAULT_CANVAS_INPUT_PREFERENCES }, lastTool: null };
    canvasInputPreferencesStore.setState({
        scope,
        ...snapshot,
        canvasTool: defaultTool(snapshot.preferences),
    });
}

// Synchronous identity subscription clears old account data before any consumer renders.
useUserStore.subscribe(synchronizeScope);
synchronizeScope();

/** Subscription only: opening preferences must never initialize/reset the active tool. */
export function useCanvasInputPreferences() {
    const { preferences, canvasTool, setCanvasTool, updatePreferences, resetPreferences } = useStore(canvasInputPreferencesStore);
    return { preferences, canvasTool, setCanvasTool, updatePreferences, resetPreferences };
}

/** Call only from the canvas route owner, independently of modal subscriptions. */
export function useCanvasInputEntry(entryKey: string | undefined) {
    const scope = useStore(canvasInputPreferencesStore, (state) => state.scope);
    useEffect(() => {
        if (entryKey !== undefined && scope !== null) canvasInputPreferencesStore.getState().initializeEntry();
    }, [entryKey, scope]);
}
