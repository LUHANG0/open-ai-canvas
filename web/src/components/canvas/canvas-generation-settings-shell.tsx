import type { ReactNode } from "react";
import { Check, X } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";

type CanvasGenerationSettingsShellProps = {
    title: string;
    summary: string;
    icon: ReactNode;
    theme: CanvasTheme;
    children: ReactNode;
    onClose: () => void;
};

export function CanvasGenerationSettingsShell({ title, summary, icon, theme, children, onClose }: CanvasGenerationSettingsShellProps) {
    return (
        <section className="canvas-generation-settings-shell" aria-label={title} style={{ color: theme.node.text }}>
            <header className="canvas-generation-settings-header" style={{ borderColor: theme.toolbar.border, background: theme.spatial.elevated }}>
                <span className="canvas-generation-settings-icon" style={{ background: theme.toolbar.activeBg, color: theme.accent.primary }}>
                    {icon}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-5">{title}</div>
                    <div className="mt-0.5 truncate text-[var(--fs-tiny)] leading-4" style={{ color: theme.node.muted }} title={summary}>
                        {summary}
                    </div>
                </div>
                <button type="button" className="canvas-generation-settings-close" aria-label={`关闭${title}`} style={{ color: theme.node.muted }} onClick={onClose}>
                    <X className="size-4" />
                </button>
            </header>
            <div className="canvas-generation-settings-scroll">{children}</div>
            <footer className="canvas-generation-settings-footer" style={{ borderColor: theme.toolbar.border, color: theme.node.muted, background: theme.spatial.elevated }}>
                <Check className="size-3.5" style={{ color: theme.accent.primary }} />
                修改后立即应用
            </footer>
        </section>
    );
}
