import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ContextMenuState } from "@/types/canvas";

export type CanvasHistorySnapshot = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
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
    backgroundMode?: ValuePatch<CanvasBackgroundMode>;
    showImageInfo?: ValuePatch<boolean>;
};

type UseCanvasHistoryOptions = CanvasHistorySnapshot & {
    projectLoaded: boolean;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    setBackgroundMode: Dispatch<SetStateAction<CanvasBackgroundMode>>;
    setShowImageInfo: Dispatch<SetStateAction<boolean>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    /** 撤销/重做前关闭节点编辑器等瞬时 UI，避免恢复后残留幽灵面板。 */
    onApplySnapshot?: () => void;
};

export function useCanvasHistory({
    projectLoaded,
    nodes,
    connections,
    chatSessions,
    activeChatId,
    backgroundMode,
    showImageInfo,
    setNodes,
    setConnections,
    setChatSessions,
    setActiveChatId,
    setBackgroundMode,
    setShowImageInfo,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    onApplySnapshot,
}: UseCanvasHistoryOptions) {
    const historyRef = useRef<{ past: CanvasHistoryPatch[]; future: CanvasHistoryPatch[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistorySnapshot | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const externalSnapshotPendingRef = useRef(false);
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const latestSnapshotRef = useRef<CanvasHistorySnapshot>({ nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo });
    // 事件可能发生在 180ms 合并窗口内；渲染期同步最新引用，撤销时即可先落盘再回退。
    latestSnapshotRef.current = { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo };

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
        latestSnapshotRef.current = snapshot;
        applyingHistoryRef.current = false;
        historyPausedRef.current = false;
        externalSnapshotPendingRef.current = false;
        setHistoryState({ canUndo: false, canRedo: false });
    }, [clearCommitTimer]);

    const applyHistorySnapshot = useCallback((snapshot: CanvasHistorySnapshot) => {
        clearCommitTimer();
        applyingHistoryRef.current = true;
        lastHistoryRef.current = snapshot;
        latestSnapshotRef.current = snapshot;
        onApplySnapshot?.();
        setNodes(snapshot.nodes);
        setConnections(snapshot.connections);
        setChatSessions(snapshot.chatSessions);
        setActiveChatId(snapshot.activeChatId);
        setBackgroundMode(snapshot.backgroundMode);
        setShowImageInfo(snapshot.showImageInfo);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
        applyTimerRef.current = setTimeout(() => {
            applyingHistoryRef.current = false;
            applyTimerRef.current = null;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, [clearCommitTimer, onApplySnapshot, setActiveChatId, setBackgroundMode, setChatSessions, setConnections, setContextMenu, setNodes, setSelectedConnectionId, setSelectedNodeIds, setShowImageInfo]);

    const commitPendingHistory = useCallback(() => {
        clearCommitTimer();
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return false;
        const current = latestSnapshotRef.current;
        const last = lastHistoryRef.current;
        if (!last || snapshotsShareReferences(last, current)) return false;
        const patch = createCanvasHistoryPatch(last, current);
        lastHistoryRef.current = current;
        if (!patch) return false;
        historyRef.current.past = [...historyRef.current.past.slice(-49), patch];
        historyRef.current.future = [];
        setHistoryState({ canUndo: true, canRedo: false });
        return true;
    }, [clearCommitTimer, projectLoaded]);

    /**
     * 媒体 URL 恢复等非用户写入会改变节点引用，但不应该生成“撤销”步骤。
     * 先提交真实用户的待合并编辑，再让下一批外部恢复状态只更新历史基线。
     */
    const prepareExternalHistoryUpdate = useCallback(() => {
        commitPendingHistory();
        externalSnapshotPendingRef.current = true;
    }, [commitPendingHistory]);

    const undoCanvas = useCallback(() => {
        commitPendingHistory();
        const patch = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!patch || !current) return;
        historyRef.current.future.push(patch);
        applyHistorySnapshot(applyCanvasHistoryPatch(current, patch, "before"));
    }, [applyHistorySnapshot, commitPendingHistory]);

    const redoCanvas = useCallback(() => {
        const patch = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!patch || !current) return;
        historyRef.current.past.push(patch);
        applyHistorySnapshot(applyCanvasHistoryPatch(current, patch, "after"));
    }, [applyHistorySnapshot]);

    const getHistoryCleanupContext = useCallback(() => ({ history: historyRef.current, lastHistory: lastHistoryRef.current }), []);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = latestSnapshotRef.current;
        const previous = lastHistoryRef.current;
        if (!previous || snapshotsShareReferences(previous, next)) return;

        if (externalSnapshotPendingRef.current) {
            externalSnapshotPendingRef.current = false;
            clearCommitTimer();
            lastHistoryRef.current = next;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
            return;
        }

        // 新数组但内容引用和顺序均未变化时直接更新基线，避免出现点亮后无法撤销的假步骤。
        if (!createCanvasHistoryPatch(previous, next)) {
            lastHistoryRef.current = next;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
            return;
        }

        clearCommitTimer();
        // 立即让按钮可用；实际补丁仍在短窗口内合并，连续拖动只占一个历史步骤。
        setHistoryState({ canUndo: true, canRedo: false });
        historyCommitTimerRef.current = setTimeout(() => void commitPendingHistory(), 180);

        return clearCommitTimer;
    }, [activeChatId, backgroundMode, chatSessions, clearCommitTimer, commitPendingHistory, connections, nodes, projectLoaded, showImageInfo]);

    useEffect(() => () => {
        clearCommitTimer();
        if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    }, [clearCommitTimer]);

    return { getHistoryCleanupContext, historyPausedRef, historyState, prepareExternalHistoryUpdate, redoCanvas, resetHistory, undoCanvas };
}

function snapshotsShareReferences(before: CanvasHistorySnapshot, after: CanvasHistorySnapshot) {
    return before.nodes === after.nodes
        && before.connections === after.connections
        && before.chatSessions === after.chatSessions
        && before.activeChatId === after.activeChatId
        && before.backgroundMode === after.backgroundMode
        && before.showImageInfo === after.showImageInfo;
}

export function createCanvasHistoryPatch(before: CanvasHistorySnapshot, after: CanvasHistorySnapshot): CanvasHistoryPatch | null {
    const patch: CanvasHistoryPatch = {};
    patch.nodes = createEntityPatch(before.nodes, after.nodes);
    patch.connections = createEntityPatch(before.connections, after.connections);
    patch.chatSessions = createEntityPatch(before.chatSessions, after.chatSessions);
    if (before.activeChatId !== after.activeChatId) patch.activeChatId = { before: before.activeChatId, after: after.activeChatId };
    if (before.backgroundMode !== after.backgroundMode) patch.backgroundMode = { before: before.backgroundMode, after: after.backgroundMode };
    if (before.showImageInfo !== after.showImageInfo) patch.showImageInfo = { before: before.showImageInfo, after: after.showImageInfo };
    return Object.values(patch).some(Boolean) ? patch : null;
}

function createEntityPatch<T extends { id: string }>(before: T[], after: T[]): EntityPatch<T> | undefined {
    const beforeById = new Map(before.map((item) => [item.id, item]));
    const afterById = new Map(after.map((item) => [item.id, item]));
    const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
    const changes: EntityChange<T>[] = [];
    ids.forEach((id) => {
        const beforeItem = beforeById.get(id);
        const afterItem = afterById.get(id);
        if (beforeItem !== afterItem) changes.push({ id, before: beforeItem, after: afterItem });
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

export function applyCanvasHistoryPatch(snapshot: CanvasHistorySnapshot, patch: CanvasHistoryPatch, side: "before" | "after"): CanvasHistorySnapshot {
    return {
        nodes: patch.nodes ? applyEntityPatch(snapshot.nodes, patch.nodes, side) : snapshot.nodes,
        connections: patch.connections ? applyEntityPatch(snapshot.connections, patch.connections, side) : snapshot.connections,
        chatSessions: patch.chatSessions ? applyEntityPatch(snapshot.chatSessions, patch.chatSessions, side) : snapshot.chatSessions,
        activeChatId: patch.activeChatId ? patch.activeChatId[side] : snapshot.activeChatId,
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
