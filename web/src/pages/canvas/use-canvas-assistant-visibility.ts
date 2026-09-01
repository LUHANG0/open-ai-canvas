import { useCallback, useState } from "react";
import type { CanvasAgentMode } from "@/components/canvas/canvas-agent-chat-ui";

export function useCanvasAssistantVisibility() {
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [agentMode, setAgentMode] = useState<CanvasAgentMode>("online");

    const openAgent = useCallback((mode?: CanvasAgentMode) => {
        if (mode) setAgentMode(mode);
        setAssistantMounted(true);
        setAssistantOpen(true);
    }, []);

    const closeAgent = useCallback(() => {
        setAssistantOpen(false);
    }, []);

    return {
        agentMode,
        // 首次打开后保留面板树，收起仅切换可见性，避免再次呼出时重建 Agent 状态。
        assistantClosing: assistantMounted && !assistantOpen,
        assistantMounted,
        assistantOpen: assistantMounted && assistantOpen,
        closeAgent,
        openAgent,
        setAgentMode,
    };
}
