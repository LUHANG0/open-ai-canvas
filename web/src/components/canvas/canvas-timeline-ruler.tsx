// 时间线标尺：按缩放渲染刻度与播放头，点击/拖拽设置播放头时间。

import { useMemo, useRef } from "react";

import { formatTimelineTime, getRulerTickStep, getTimelineTimeAtOffset } from "@/lib/timeline/timeline-view";
import type { CanvasTheme } from "@/lib/canvas-theme";

type CanvasTimelineRulerProps = {
    pxPerMs: number;
    durationMs: number;
    playheadMs: number;
    width: number;
    theme: CanvasTheme;
    onSeek: (ms: number) => void;
};

export function CanvasTimelineRuler({ pxPerMs, durationMs, playheadMs, width, theme, onSeek }: CanvasTimelineRulerProps) {
    const barRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);

    const ticks = useMemo(() => {
        const stepMs = getRulerTickStep(pxPerMs);
        const count = Math.max(1, Math.ceil(durationMs / stepMs));
        return Array.from({ length: count + 1 }, (_, index) => {
            const ms = index * stepMs;
            const x = Math.round(ms * pxPerMs);
            return { ms, x, major: index % 5 === 0 };
        });
    }, [durationMs, pxPerMs]);

    const seekFromEvent = (clientX: number) => {
        const rect = barRef.current?.getBoundingClientRect();
        if (!rect) return;
        onSeek(getTimelineTimeAtOffset(clientX - rect.left, pxPerMs, durationMs));
    };

    return (
        <div
            ref={barRef}
            data-timeline-ruler
            role="slider"
            tabIndex={0}
            aria-label="时间线播放头"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={playheadMs}
            aria-valuetext={formatTimelineTime(playheadMs)}
            onKeyDown={(event) => {
                const step = event.shiftKey ? 1000 : 100;
                const next = event.key === "Home" ? 0 : event.key === "End" ? durationMs : event.key === "ArrowLeft" ? Math.max(0, playheadMs - step) : event.key === "ArrowRight" ? Math.min(durationMs, playheadMs + step) : null;
                if (next !== null) { event.preventDefault(); event.stopPropagation(); onSeek(next); }
            }}
            onPointerCancel={() => { draggingRef.current = false; }}
            onLostPointerCapture={() => { draggingRef.current = false; }}
            className="relative shrink-0 cursor-col-resize select-none overflow-hidden border-b"
            style={{ width, height: 32, borderColor: theme.toolbar.border, background: theme.toolbar.panel }}
            onPointerDown={(event) => {
                draggingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                seekFromEvent(event.clientX);
            }}
            onPointerMove={(event) => {
                if (draggingRef.current) seekFromEvent(event.clientX);
            }}
            onPointerUp={(event) => {
                draggingRef.current = false;
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
        >
            {ticks.map((tick) => (
                <div key={tick.ms} className="absolute top-0 h-full" style={{ left: tick.x }}>
                    <div className="absolute top-0 w-px" style={{ height: tick.major ? 10 : 5, background: theme.timeline.rulerTick }} />
                    {tick.major ? (
                        <span className="absolute left-1 top-1 whitespace-nowrap text-[10px] leading-none opacity-60" style={{ color: theme.timeline.rulerLabel }}>
                            {formatTimelineTime(tick.ms)}
                        </span>
                    ) : null}
                </div>
            ))}
            <div className="pointer-events-none absolute bottom-0 top-0" style={{ left: Math.round(playheadMs * pxPerMs), width: 2, background: theme.timeline.playhead }}>
                <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-semibold leading-none" style={{ color: theme.timeline.playhead }}>
                    {formatTimelineTime(playheadMs)}
                </span>
            </div>
        </div>
    );
}
