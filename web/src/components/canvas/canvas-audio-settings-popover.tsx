import { useCanvasTheme } from "@/components/canvas/canvas-theme-provider";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { Music2, Settings2 } from "lucide-react";
import { Button } from "antd";

import { AudioSettingsPanel } from "@/components/audio-settings-panel";
import { audioFormatLabel, audioSpeedLabel, audioVoiceLabel } from "@/lib/audio-generation";
import { canvasThemes } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasGenerationSettingsShell } from "./canvas-generation-settings-shell";
import { canvasSettingsPopoverStyle, useCanvasSettingsPopover, type CanvasSettingsPlacement } from "./use-canvas-settings-popover";

export type CanvasAudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions";

type CanvasAudioSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: CanvasAudioSettingKey, value: string) => void;
    buttonClassName?: string;
    placement?: CanvasSettingsPlacement;
};

export function CanvasAudioSettingsPopover({ config, onConfigChange, buttonClassName, placement = "topLeft" }: CanvasAudioSettingsPopoverProps) {
    const theme = useCanvasTheme();
    const { buttonRef, panelRef, open, buttonRect, setOpen } = useCanvasSettingsPopover();
    const summary = `${audioVoiceLabel(config.audioVoice)} · ${audioFormatLabel(config.audioFormat)} · ${audioSpeedLabel(config.audioSpeed)}`;

    const panel = open && buttonRect ? <AudioSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} summary={summary} onConfigChange={onConfigChange} onClose={() => setOpen(false)} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={`canvas-generation-settings-trigger ${buttonClassName || "!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5"}`} style={{ background: theme.node.fill, color: theme.node.text }} icon={<Settings2 className="size-3.5" />} aria-expanded={open} aria-label={`音频设置：${summary}`} title={`音频设置 · ${summary}`} onClick={() => setOpen(!open)}>
                    <span className="truncate">{summary}</span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function AudioSettingsPortal({
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
    placement: CanvasAudioSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    summary: string;
    onConfigChange: (key: CanvasAudioSettingKey, value: string) => void;
    onClose: () => void;
}) {
    const style = {
        ...canvasSettingsPopoverStyle({ buttonRect, placement: placement || "topLeft", preferredWidth: 420, estimatedHeight: 410, minimumHeight: 240 }),
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
            <CanvasGenerationSettingsShell title="音频设置" summary={summary} icon={<Music2 className="size-4" />} theme={theme} onClose={onClose}>
                <AudioSettingsPanel config={config} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} className="canvas-generation-settings-body space-y-4" />
            </CanvasGenerationSettingsShell>
        </div>,
        document.body,
    );
}
