export type CanvasInlinePanelLoadingProps = {
    label: string;
    minHeight: number;
    onClose: () => void;
    closeLabel?: string;
};

export function CanvasInlinePanelLoading({ label, minHeight, onClose, closeLabel = "关闭加载面板" }: CanvasInlinePanelLoadingProps) {
    return (
        <div
            data-canvas-no-zoom
            className="flex w-full items-start justify-between gap-3 rounded-[var(--r-2xl)] border bg-background/95 px-4 py-3 text-sm text-foreground shadow-xl backdrop-blur-xl"
            style={{ minHeight }}
            role="status"
            aria-live="polite"
        >
            <span className="pt-1 font-medium">{label}</span>
            <button type="button" className="shrink-0 rounded-md px-2 py-1 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={onClose} aria-label={closeLabel}>
                关闭
            </button>
        </div>
    );
}
