import { useState } from "react";

import type { CanvasAssistantSession, CanvasConnection } from "@/types/canvas";

export function useCanvasProjectContentState() {
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);

    return {
        activeChatId,
        chatSessions,
        connections,
        setActiveChatId,
        setChatSessions,
        setConnections,
    };
}
