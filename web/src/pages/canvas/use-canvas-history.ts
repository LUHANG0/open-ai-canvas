import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { CanvasAppearance } from "@/lib/canvas/canvas-appearance";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ContextMenuState } from "@/types/canvas";

export type CanvasHistorySnapshot = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    canvasAppearance: CanvasAppearance;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

type EntityChange<T> = {
    id: string;
    before?: T;
    after?: T;
};

type EntityPatch<T> = {
    changes: EntityChange<T>[];
    beforeOrder?: string[];
    afterOrder?: string[];
};

type ValuePatch<T> = {
    before: T;
    after: T;
};

type CanvasHistoryPatch = {
    nodes?: EntityPatch<CanvasNodeData>;
    connections?: EntityPatch<CanvasConnection>;
    chatSessions?: EntityPatch<CanvasAssistantSession>;
    activeChatId?: ValuePatch<string | null>;
    canvasAppearance?: ValuePatch<CanvasAppearance>;
    backgroundMode?: ValuePatch<CanvasBackgroundMode>;
    showImageInfo?: ValuePatch<boolean>;
};

type UseCanvasHistoryOptions = CanvasHistorySnapshot & {
    projectLoaded: boolean;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    applyCanvasAppearance: (appearance: CanvasAppearance) => void;
    setBackgroundMode: Dispatch<SetStateAction<CanvasBackgroundMode>>;
    setShowImageInfo: Dispatch<SetStateAction<boolean>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

export function useCanvasHistory({
    projectLoaded,
    nodes,
    connections,
    chatSessions,
    activeChatId,
    canvasAppearance,
    backgroundMode,
    showImageInfo,
    setNodes,
    setConnections,
    setChatSessions,
    setActiveChatId,
    applyCanvasAppearance,
    setBackgroundMode,
    setShowImageInfo,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
}: UseCanvasHistoryOptions) {
    const historyRef = useRef<{ past: CanvasHistoryPatch[]; future: CanvasHistoryPatch[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistorySnapshot | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const historyPausedRef = useRef(false);
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

    const createHistorySnapshot = useCallback(
        (): CanvasHistorySnapshot => ({ nodes, connections, chatSessions, activeChatId, canvasAppearance, backgroundMode, showImageInfo }),
        [activeChatId, backgroundMode, canvasAppearance, chatSessions, connections, nodes, showImageInfo],
    );

    const clearCommitTimer = useCallback(() => {
        if (!historyCommitTimerRef.current) return;
        clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = null;
    }, []);

    const resetHistory = useCallback((snapshot: CanvasHistorySnapshot) => {
        clearCommitTimer();
        if (applyTimerRef.current) {
            clearTimeout(applyTimerRef.current);
            applyTimerRef.current = null;
        }
        historyRef.current = { past: [], future: [] };
        lastHistoryRef.current = snapshot;
        historyPausedRef.current = false;
        setHistoryState({ canUndo: false, canRedo: false });
    }, [clearCommitTimer]);

    const applyHistorySnapshot = useCallback((snapshot: CanvasHistorySnapshot) => {
        clearCommitTimer();
        lastHistoryRef.current = snapshot;
        setNodes(snapshot.nodes);
        setConnections(snapshot.connections);
        setChatSessions(snapshot.chatSessions);
        setActiveChatId(snapshot.activeChatId);
        applyCanvasAppearance(snapshot.canvasAppearance);
        setBackgroundMode(snapshot.backgroundMode);
        setShowImageInfo(snapshot.showImageInfo);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
        applyTimerRef.current = setTimeout(() => {
            applyTimerRef.current = null;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, [applyCanvasAppearance, clearCommitTimer, setActiveChatId, setBackgroundMode, setChatSessions, setConnections, setContextMenu, setNodes, setSelectedConnectionId, setSelectedNodeIds, setShowImageInfo]);

    const commitPendingHistory = useCallback(() => {
        clearCommitTimer();
        if (!projectLoaded || historyPausedRef.current) return;
        const current = createHistorySnapshot();
        const last = lastHistoryRef.current;
        if (!last || snapshotsShareReferences(last, current)) return;
        const patch = createCanvasHistoryPatch(last, current);
        // Equal save echoes advance the reference baseline, not the undo stack.
        lastHistoryRef.current = current;
        if (!patch) return;
        historyRef.current.past.push(patch);
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
        setHistoryState({ canUndo: true, canRedo: false });
    }, [clearCommitTimer, createHistorySnapshot, projectLoaded]);

    const undoCanvas = useCallback(() => {
        // An edit may still be inside the ordinary 180ms merge window.
        commitPendingHistory();
        const patch = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!patch || !current) return;
        historyRef.current.future.push(patch);
        applyHistorySnapshot(applyCanvasHistoryPatch(current, patch, "before"));
    }, [applyHistorySnapshot, commitPendingHistory]);

    const redoCanvas = useCallback(() => {
        // A genuine new edit must invalidate an older future before popping it.
        commitPendingHistory();
        const patch = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!patch || !current) return;
        historyRef.current.past.push(patch);
        applyHistorySnapshot(applyCanvasHistoryPatch(current, patch, "after"));
    }, [applyHistorySnapshot, commitPendingHistory]);

    const getHistoryCleanupContext = useCallback(() => ({ history: historyRef.current, lastHistory: lastHistoryRef.current }), []);

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        const next = createHistorySnapshot();
        const previous = lastHistoryRef.current;
        if (!previous || snapshotsShareReferences(previous, next)) return;

        clearCommitTimer();
        historyCommitTimerRef.current = setTimeout(commitPendingHistory, 180);

        return clearCommitTimer;
    }, [clearCommitTimer, commitPendingHistory, createHistorySnapshot, projectLoaded]);

    useEffect(() => () => {
        clearCommitTimer();
        if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    }, [clearCommitTimer]);

    return { getHistoryCleanupContext, historyPausedRef, historyState, redoCanvas, resetHistory, undoCanvas };
}

function snapshotsShareReferences(before: CanvasHistorySnapshot, after: CanvasHistorySnapshot) {
    return before.nodes === after.nodes
        && before.connections === after.connections
        && before.chatSessions === after.chatSessions
        && before.activeChatId === after.activeChatId
        && before.canvasAppearance === after.canvasAppearance
        && before.backgroundMode === after.backgroundMode
        && before.showImageInfo === after.showImageInfo;
}

/** JSON-shaped document values: key order is not content, and undefined object
 * members are absent on persistence. Arrays remain ordered. Shared references
 * return before enumeration, especially for large unchanged media metadata. */
function sameHistoryValue(before: unknown, after: unknown): boolean {
    if (before === after) return true;
    if (!before || !after || typeof before !== "object" || typeof after !== "object") return false;
    if (Array.isArray(before) || Array.isArray(after)) {
        if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return false;
        for (let index = 0; index < before.length; index++) if (!sameHistoryValue(before[index], after[index])) return false;
        return true;
    }
    const left = before as Record<string, unknown>, right = after as Record<string, unknown>;
    let definedKeys = 0;
    for (const key of Object.keys(left)) {
        if (left[key] === undefined) continue;
        if (!Object.hasOwn(right, key) || !sameHistoryValue(left[key], right[key])) return false;
        definedKeys++;
    }
    for (const key of Object.keys(right)) if (right[key] !== undefined) definedKeys--;
    return definedKeys === 0;
}

function createCanvasHistoryPatch(before: CanvasHistorySnapshot, after: CanvasHistorySnapshot): CanvasHistoryPatch | null {
    const patch: CanvasHistoryPatch = {};
    patch.nodes = createEntityPatch(before.nodes, after.nodes);
    patch.connections = createEntityPatch(before.connections, after.connections);
    patch.chatSessions = createEntityPatch(before.chatSessions, after.chatSessions);
    if (before.activeChatId !== after.activeChatId) patch.activeChatId = { before: before.activeChatId, after: after.activeChatId };
    if (!sameHistoryValue(before.canvasAppearance, after.canvasAppearance)) patch.canvasAppearance = { before: before.canvasAppearance, after: after.canvasAppearance };
    if (before.backgroundMode !== after.backgroundMode) patch.backgroundMode = { before: before.backgroundMode, after: after.backgroundMode };
    if (before.showImageInfo !== after.showImageInfo) patch.showImageInfo = { before: before.showImageInfo, after: after.showImageInfo };
    return Object.values(patch).some(Boolean) ? patch : null;
}

function createEntityPatch<T extends { id: string }>(before: T[], after: T[]): EntityPatch<T> | undefined {
    if (before === after) return undefined;
    const beforeById = new Map(before.map((item) => [item.id, item]));
    const afterById = new Map(after.map((item) => [item.id, item]));
    const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
    const changes: EntityChange<T>[] = [];
    ids.forEach((id) => {
        const beforeItem = beforeById.get(id);
        const afterItem = afterById.get(id);
        if (!sameHistoryValue(beforeItem, afterItem)) changes.push({ id, before: beforeItem, after: afterItem });
    });

    const beforeOrder = before.map((item) => item.id);
    const afterOrder = after.map((item) => item.id);
    const orderChanged = beforeOrder.length !== afterOrder.length || beforeOrder.some((id, index) => id !== afterOrder[index]);
    if (!changes.length && !orderChanged) return undefined;
    return {
        changes,
        beforeOrder: orderChanged ? beforeOrder : undefined,
        afterOrder: orderChanged ? afterOrder : undefined,
    };
}

function applyCanvasHistoryPatch(snapshot: CanvasHistorySnapshot, patch: CanvasHistoryPatch, side: "before" | "after"): CanvasHistorySnapshot {
    return {
        nodes: patch.nodes ? applyEntityPatch(snapshot.nodes, patch.nodes, side) : snapshot.nodes,
        connections: patch.connections ? applyEntityPatch(snapshot.connections, patch.connections, side) : snapshot.connections,
        chatSessions: patch.chatSessions ? applyEntityPatch(snapshot.chatSessions, patch.chatSessions, side) : snapshot.chatSessions,
        activeChatId: patch.activeChatId ? patch.activeChatId[side] : snapshot.activeChatId,
        canvasAppearance: patch.canvasAppearance ? patch.canvasAppearance[side] : snapshot.canvasAppearance,
        backgroundMode: patch.backgroundMode ? patch.backgroundMode[side] : snapshot.backgroundMode,
        showImageInfo: patch.showImageInfo ? patch.showImageInfo[side] : snapshot.showImageInfo,
    };
}

function applyEntityPatch<T extends { id: string }>(current: T[], patch: EntityPatch<T>, side: "before" | "after") {
    const byId = new Map(current.map((item) => [item.id, item]));
    patch.changes.forEach((change) => {
        const value = change[side];
        if (value) byId.set(change.id, value);
        else byId.delete(change.id);
    });

    // 成员增删时按补丁记录恢复精确顺序；仅内容变化时保留当前顺序，避免无意义数组抖动。
    const order = side === "before" ? patch.beforeOrder : patch.afterOrder;
    if (!order) return current.map((item) => byId.get(item.id)).filter((item): item is T => Boolean(item));
    return order.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}
