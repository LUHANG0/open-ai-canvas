import { useEffect, useState, type CSSProperties } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import "./canvas-original-image-feedback.css";

export function CanvasOriginalImageFeedback({ busy, failed, completed = false, hasPreview = false, width, height, bytes, theme, onRetry }: {
    busy: boolean;
    failed: boolean;
    completed?: boolean;
    hasPreview?: boolean;
    width?: number;
    height?: number;
    bytes?: number;
    theme: CanvasTheme;
    onRetry: () => void;
}) {
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        setSlow(false);
        if (!busy || failed) return;
        const timer = setTimeout(() => setSlow(true), 8_000);
        return () => clearTimeout(timer);
    }, [busy, failed]);

    const dimensions = width && height && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? `${Math.round(width)} × ${Math.round(height)}` : "";
    const details = [dimensions, bytes && Number.isFinite(bytes) && bytes > 0 ? formatBytes(bytes) : ""].filter(Boolean).join(" · ");
    const title = failed ? "原图加载失败" : busy ? completed ? "生成完成，原图加载中" : "正在加载原图" : "等待加载原图";
    const hint = failed ? hasPreview ? "当前保留已有预览，可重试加载原图" : "可重新加载原图，无需重新生成" : hasPreview ? "当前保留已有预览，原图就绪后替换" : slow ? "原图较大或网络较慢，请稍候" : "原图就绪后显示完整细节";

    return (
        <div
            className={`canvas-original-image-feedback${hasPreview ? " has-preview" : ""}`}
            data-canvas-no-zoom data-canvas-wheel-scroll
            style={{ "--original-image-fill": theme.node.fill, "--original-image-ink": theme.node.text, "--original-image-muted": theme.node.muted, "--original-image-stroke": theme.node.stroke, "--original-image-hover": theme.toolbar.itemHover } as CSSProperties}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="canvas-original-image-panel">
                <div role="status" aria-live="polite" aria-atomic="true" aria-busy={busy && !failed} className="canvas-original-image-copy">
                    {!hasPreview && !failed ? <span className="canvas-original-image-placeholder" data-active={busy} aria-hidden="true" /> : null}
                    <strong>{title}</strong>
                    {details ? <span>{details}</span> : null}
                    <small>{hint}</small>
                </div>
                {failed ? <button type="button" className="canvas-original-image-retry" onClick={(event) => { event.stopPropagation(); onRetry(); }}>重新加载原图</button> : null}
            </div>
        </div>
    );
}
