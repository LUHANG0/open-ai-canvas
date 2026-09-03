import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getActiveUserScope } from "@/lib/user-scope";
import { createCanvasGenerationLiveProjectAdapter, registerCanvasGenerationLiveProject } from "@/services/canvas-generation-consumer";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

interface CanvasLiveProjectRefs {
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    chatSessionsRef: { current: CanvasAssistantSession[] };
    activeChatIdRef: { current: string | null };
    selectedNodeIdsRef: { current: Set<string> };
    viewportRef: { current: ViewportTransform };
}

interface CanvasLiveProjectSnapshot {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    selectedNodeIds: Set<string>;
    viewport: ViewportTransform;
}

export function syncCanvasLiveProjectRefs(refs: CanvasLiveProjectRefs, snapshot: CanvasLiveProjectSnapshot) {
    refs.nodesRef.current = snapshot.nodes;
    refs.connectionsRef.current = snapshot.connections;
    refs.chatSessionsRef.current = snapshot.chatSessions;
    refs.activeChatIdRef.current = snapshot.activeChatId;
    refs.selectedNodeIdsRef.current = snapshot.selectedNodeIds;
    refs.viewportRef.current = snapshot.viewport;
}

interface UseCanvasLiveProjectOptions extends CanvasLiveProjectSnapshot {
    projectId: string;
    nodesRef: { current: CanvasNodeData[] };
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
}

export function useCanvasLiveProject({ projectId, nodesRef, nodes, connections, chatSessions, activeChatId, selectedNodeIds, viewport, setNodes, setConnections, setChatSessions, setActiveChatId }: UseCanvasLiveProjectOptions) {
    const connectionsRef = useRef(connections);
    const chatSessionsRef = useRef(chatSessions);
    const activeChatIdRef = useRef(activeChatId);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const refs = { nodesRef, connectionsRef, chatSessionsRef, activeChatIdRef, selectedNodeIdsRef, viewportRef };

    useLayoutEffect(() => {
        syncCanvasLiveProjectRefs(refs, { nodes, connections, chatSessions, activeChatId, selectedNodeIds, viewport });
    }, [activeChatId, chatSessions, connections, nodes, selectedNodeIds, viewport]);

    const canvasStorageScope = getActiveUserScope();
    useEffect(() => {
        if (!projectId) return;
        return registerCanvasGenerationLiveProject({
            scope: canvasStorageScope,
            projectId,
            adapter: createCanvasGenerationLiveProjectAdapter({ nodesRef, connectionsRef, chatSessionsRef, activeChatIdRef, setNodes, setConnections, setChatSessions, setActiveChatId }),
        });
    }, [activeChatIdRef, canvasStorageScope, chatSessionsRef, connectionsRef, nodesRef, projectId, setActiveChatId, setChatSessions, setConnections, setNodes]);

    const handleAssistantSessionsChange = useCallback(
        (sessions: CanvasAssistantSession[], activeId: string | null) => {
            chatSessionsRef.current = sessions;
            activeChatIdRef.current = activeId;
            setChatSessions(sessions);
            setActiveChatId(activeId);
        },
        [setActiveChatId, setChatSessions],
    );

    return { connectionsRef, chatSessionsRef, activeChatIdRef, selectedNodeIdsRef, viewportRef, handleAssistantSessionsChange };
}
