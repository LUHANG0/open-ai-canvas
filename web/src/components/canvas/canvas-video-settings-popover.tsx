import { useCanvasTheme } from "@/components/canvas/canvas-theme-provider";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2, Video } from "lucide-react";
import { Button } from "antd";

import { VideoSettingsPanel, videoResolutionLabel, videoSecondsLabel, videoSizeLabel } from "@/components/video-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { modelCapabilityConfigFor, resolveVideoRatioValue, resolveVideoResolutionValue } from "@/lib/model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasGenerationSettingsShell } from "./canvas-generation-settings-shell";
import { canvasSettingsPopoverStyle, useCanvasSettingsPopover, type CanvasSettingsPlacement } from "./use-canvas-settings-popover";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    buttonClassName?: string;
    placement?: CanvasSettingsPlacement;
};

export function CanvasVideoSettingsPopover({ config, onConfigChange, buttonClassName, placement = "topLeft" }: CanvasVideoSettingsPopoverProps) {
    const theme = useCanvasTheme();
    const { buttonRef, panelRef, open, buttonRect, setOpen } = useCanvasSettingsPopover();
    const videoProfile = modelCapabilityConfigFor(config, config.model).video;
    const resolutionSupported = Boolean(videoProfile?.resolutions.length);
    const sizeSupported = Boolean(videoProfile?.ratios.length);
    const resolution = videoProfile ? resolveVideoResolutionValue(videoProfile, config.vquality) : "";
    const size = videoProfile ? resolveVideoRatioValue(videoProfile, config.size) : "";
    const summary = [
        ...(resolutionSupported ? [videoResolutionLabel(resolution)] : []),
        ...(sizeSupported ? [videoSizeLabel(size)] : []),
        videoSecondsLabel(config.videoSeconds),
    ].join(" · ");

    const panel = open && buttonRect ? <VideoSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} summary={summary} onConfigChange={onConfigChange} onClose={() => setOpen(false)} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={`canvas-generation-settings-trigger ${buttonClassName || "!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5"}`} style={{ background: theme.node.fill, color: theme.node.text }} icon={<Settings2 className="size-3.5" />} aria-expanded={open} aria-label={`视频设置：${summary}`} title={`视频设置 · ${summary}`} onClick={() => setOpen(!open)}>
                    <span className="truncate">{summary}</span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function VideoSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    summary,
    onConfigChange,
    onClose,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasVideoSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    summary: string;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onClose: () => void;
}) {
    const style = {
        ...canvasSettingsPopoverStyle({ buttonRect, placement: placement || "topLeft", estimatedHeight: 370, minimumHeight: 260 }),
        background: theme.spatial.elevated,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: "var(--app-surface-radius)",
        boxShadow: "var(--app-shadow-overlay)",
        padding: 0,
        overflow: "hidden",
        color: theme.node.text,
    };

    return createPortal(
        <div
            ref={panelRef}
            data-canvas-overlay
            data-canvas-no-zoom
            className="canvas-generation-settings-popover aceternity-floating-panel backdrop-blur-2xl"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <CanvasGenerationSettingsShell title="视频设置" summary={summary} icon={<Video className="size-4" />} theme={theme} onClose={onClose}>
                <VideoSettingsPanel config={config} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} showTitle={false} className="canvas-generation-settings-body" />
            </CanvasGenerationSettingsShell>
        </div>,
        document.body,
    );
}
