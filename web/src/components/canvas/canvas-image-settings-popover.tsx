import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Settings2 } from "lucide-react";
import { Button } from "antd";

import { ImageSettingsPanel, imageQualityLabel, imageSizeLabel } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { modelCapabilityConfigFor, normalizeImageValue } from "@/lib/model-capabilities";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasGenerationSettingsShell } from "./canvas-generation-settings-shell";
import { canvasSettingsPopoverStyle, useCanvasSettingsPopover, type CanvasSettingsPlacement } from "./use-canvas-settings-popover";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: CanvasSettingsPlacement;
    autoAdjustOverflow?: boolean;
    showCount?: boolean;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName, placement = "topLeft", showCount = true }: CanvasImageSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { buttonRef, panelRef, open, buttonRect, setOpen } = useCanvasSettingsPopover(onOpenChange);
    const profile = modelCapabilityConfigFor(config, config.model || config.imageModel).image!;
    const normalized = normalizeImageValue(profile, config);
    const summaryParts = [
        ...(profile.size.parameter !== "none" ? [imageSizeLabel(normalized.size)] : []),
        ...(profile.quality.supported ? [imageQualityLabel(normalized.quality)] : []),
        ...(showCount && profile.maxOutputs > 1 ? [`${normalized.count} 张`] : []),
        ...(profile.transparentBackground.supported && normalized.transparentBackground === "true" ? ["透明"] : []),
    ];
    const summary = summaryParts.join(" · ");
    const hasSettings = profile.size.parameter !== "none" || profile.quality.supported || profile.transparentBackground.supported || (showCount && profile.maxOutputs > 1);
    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} summary={summary} showCount={showCount} onConfigChange={onConfigChange} onClose={() => setOpen(false)} /> : null;

    if (!hasSettings) return null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={`canvas-generation-settings-trigger ${buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"}`} style={{ background: theme.node.fill, color: theme.node.text }} icon={<Settings2 className="size-3.5" />} aria-expanded={open} aria-label={`图像设置：${summary}`} title={`图像设置 · ${summary}`} onClick={() => setOpen(!open)}>
                    <span className="truncate">{summary}</span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    summary,
    showCount,
    onConfigChange,
    onClose,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    summary: string;
    showCount: boolean;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onClose: () => void;
}) {
    const style = {
        ...canvasSettingsPopoverStyle({ buttonRect, placement: placement || "topLeft", estimatedHeight: 520 }),
        background: theme.spatial.elevated,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 16,
        boxShadow: `0 24px 72px ${theme.spatial.shadow}`,
        padding: 0,
        overflow: "hidden",
        color: theme.node.text,
    };

    return createPortal(
        <div
            ref={panelRef}
            data-canvas-overlay
            className="canvas-generation-settings-popover aceternity-floating-panel backdrop-blur-2xl"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <CanvasGenerationSettingsShell title="图片设置" summary={summary} icon={<ImageIcon className="size-4" />} theme={theme} onClose={onClose}>
                <ImageSettingsPanel config={config} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} showTitle={false} showCount={showCount} quickCount={3} className="canvas-generation-settings-body" />
            </CanvasGenerationSettingsShell>
        </div>,
        document.body,
    );
}
