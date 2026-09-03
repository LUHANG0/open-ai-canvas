import { WorkspaceState } from "@/components/ui/pc/workspace-state";
import type { CanvasTheme } from "@/lib/canvas-theme";

export type CanvasWorkspaceLoadingOverlayProps = {
    title: string;
    description: string;
    theme?: CanvasTheme;
};

export function CanvasWorkspaceLoadingOverlay({ title, description, theme }: CanvasWorkspaceLoadingOverlayProps) {
    return (
        <div
            className={theme ? "fixed inset-0 z-[var(--z-toast)] grid place-items-center px-5" : "fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-background px-5 text-foreground"}
            style={theme ? { background: theme.canvas.background, color: theme.node.text } : undefined}
            role="status"
            aria-live="polite"
        >
            <WorkspaceState icon="loading" title={title} description={description} />
        </div>
    );
}
