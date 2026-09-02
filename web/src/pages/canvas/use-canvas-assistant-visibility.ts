import { useCallback, useState } from "react";
import type { CanvasAgentMode } from "@/components/canvas/canvas-agent-chat-ui";

export function openCanvasCinematicAssistant(setCinematicAgentEntry: (active: boolean) => void, openAgent: (mode?: CanvasAgentMode) => void) {
    setCinematicAgentEntry(true);
    openAgent("online");
}

export function useCanvasAssistantVisibility() {
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [agentMode, setAgentMode] = useState<CanvasAgentMode>("online");
    const [cinematicAgentEntry, setCinematicAgentEntry] = useState(false);

    const openAgent = useCallback((mode?: CanvasAgentMode) => {
        if (mode) setAgentMode(mode);
        setAssistantMounted(true);
        setAssistantOpen(true);
    }, []);

    const closeAgent = useCallback(() => {
        setAssistantOpen(false);
    }, []);

    const openCinematicAgent = useCallback(() => {
        openCanvasCinematicAssistant(setCinematicAgentEntry, openAgent);
    }, [openAgent]);

    const consumeCinematicAgentEntry = useCallback(() => setCinematicAgentEntry(false), []);

    return {
        agentMode,
        // 首次打开后保留面板树，收起仅切换可见性，避免再次呼出时重建 Agent 状态。
        assistantClosing: assistantMounted && !assistantOpen,
        assistantMounted,
        assistantOpen: assistantMounted && assistantOpen,
        cinematicAgentEntry,
        closeAgent,
        consumeCinematicAgentEntry,
        openAgent,
        openCinematicAgent,
        setAgentMode,
    };
}
