import { shouldAutoConnectCanvasRuntime } from "@/lib/canvas/local-runtime-connection";
import { readLocalRuntimeBootstrapState, type LocalRuntimeBootstrapState } from "@/services/local-runtime-bootstrap";

export function resolveCanvasLocalAgentEntry(params: URLSearchParams, bootstrap: LocalRuntimeBootstrapState = readLocalRuntimeBootstrapState()) {
    const autoConnect = shouldAutoConnectCanvasRuntime(params);
    return {
        autoConnect,
        compactAgent: autoConnect && bootstrap.legacyDeepLinkRejected,
    };
}
