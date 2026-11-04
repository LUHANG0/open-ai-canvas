import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { CANVAS_COMPLETION_FEEDBACK_MS, CanvasCompletionFeedbackLedger } from "@/lib/canvas/canvas-completion-feedback";
import type { CanvasNodeData } from "@/types/canvas";

const CompletionFeedbackContext = createContext<CanvasCompletionFeedbackLedger | null>(null);

/** Key this provider by account + project. Observe all nodes, not virtualized chrome. */
export function CanvasCompletionFeedbackProvider({ nodes, active, children }: { nodes: CanvasNodeData[]; active: boolean; children: ReactNode }) {
    const [ledger] = useState(() => new CanvasCompletionFeedbackLedger());
    useLayoutEffect(() => {
        if (active) ledger.observe(nodes, performance.now());
    }, [active, ledger, nodes]);
    return <CompletionFeedbackContext.Provider value={ledger}>{children}</CompletionFeedbackContext.Provider>;
}

const noSubscribe = () => () => {};
export function useCanvasCompletionFeedback(nodeId: string) {
    const ledger = useContext(CompletionFeedbackContext);
    const snapshot = useCallback(() => ledger?.get(nodeId) ?? null, [ledger, nodeId]);
    const feedback = useSyncExternalStore(ledger?.subscribe ?? noSubscribe, snapshot, snapshot);
    const [, expire] = useState(0);
    const elapsed = useMemo(() => (feedback ? performance.now() - feedback.startedAt : 0), [feedback]);
    const remaining = feedback ? CANVAS_COMPLETION_FEEDBACK_MS - (performance.now() - feedback.startedAt) : 0;
    useEffect(() => {
        if (remaining <= 0) return;
        const timer = setTimeout(() => expire((value) => value + 1), remaining);
        return () => clearTimeout(timer);
    }, [feedback, remaining]);
    return feedback && remaining > 0 ? { identity: feedback.identity, elapsed } : null;
}
