import { useCanvasTheme } from "@/components/canvas/canvas-theme-provider";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasAgentStore } from "@/stores/canvas/use-canvas-agent-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function useCanvasProjectEnvironment() {
    const localAgentConnected = useCanvasAgentStore((state) => state.connected);
    const localAgentActivity = useCanvasAgentStore((state) => state.activity);
    const localAgentEnabled = useCanvasAgentStore((state) => state.enabled);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const assets = useAssetStore((state) => state.assets);
    const assetsHydrated = useAssetStore((state) => state.hydrated);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const theme = useCanvasTheme();
    const defaultDrawingEngine = useUserStore((state) => state.drawingEngine.defaultEngine);
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled);
    const directorOnboardingScope = useUserStore((state) => state.user?.id?.trim() || "");

    return {
        assets,
        assetsHydrated,
        cleanupAssetImages,
        config,
        defaultDrawingEngine,
        directorOnboardingScope,
        effectiveConfig,
        isAiConfigReady,
        localAgentActivity,
        localAgentConnected,
        localAgentEnabled,
        shortDramaEnabled,
        theme,
    };
}
