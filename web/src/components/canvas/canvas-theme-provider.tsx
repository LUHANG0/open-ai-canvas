import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useBranding } from "@/components/branding/branding-provider";
import { createCanvasEditorTheme } from "@/lib/canvas/canvas-editor-theme";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

const CanvasThemeContext = createContext<CanvasTheme | null>(null);

export function CanvasThemeProvider({ children }: { children: ReactNode }) {
    const mode = useThemeStore((state) => state.theme);
    const { branding } = useBranding();
    const primaryColor = branding.config.theme.primaryColor;
    const theme = useMemo(() => createCanvasEditorTheme(mode, primaryColor), [mode, primaryColor]);
    return <CanvasThemeContext.Provider value={theme}>{children}</CanvasThemeContext.Provider>;
}

export function useCanvasTheme() {
    const theme = useContext(CanvasThemeContext);
    const mode = useThemeStore((state) => state.theme);
    // 共享节点在公开分享与专用工作台中保留原主题。
    return theme ?? canvasThemes[mode];
}
