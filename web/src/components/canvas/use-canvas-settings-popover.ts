import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

export type CanvasSettingsPlacement = "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";

export function useCanvasSettingsPopover(onOpenChange?: (open: boolean) => void) {
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpenState] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const setOpen = useCallback((nextOpen: boolean) => {
        setOpenState(nextOpen);
        onOpenChange?.(nextOpen);
    }, [onOpenChange]);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node) || buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            buttonRef.current?.querySelector<HTMLElement>("button")?.focus();
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        window.addEventListener("keydown", closeOnEscape, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            window.removeEventListener("keydown", closeOnEscape, true);
        };
    }, [open, setOpen]);

    return { buttonRef, panelRef, open, buttonRect, setOpen };
}

export function canvasSettingsPopoverStyle({ buttonRect, placement, preferredWidth = 420, estimatedHeight, minimumHeight = 140 }: { buttonRect: DOMRect; placement: CanvasSettingsPlacement; preferredWidth?: number; estimatedHeight: number; minimumHeight?: number }): CSSProperties {
    const gap = 8;
    const margin = 12;
    const width = Math.min(preferredWidth, window.innerWidth - margin * 2);
    const alignRight = placement.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const idealLeft = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topSpace = buttonRect.top - gap - margin;
    const bottomSpace = window.innerHeight - buttonRect.bottom - gap - margin;
    const prefersAbove = placement.startsWith("top");
    const placeAbove = prefersAbove ? topSpace >= estimatedHeight || topSpace >= bottomSpace : bottomSpace < estimatedHeight && topSpace > bottomSpace;
    return {
        position: "fixed",
        zIndex: "var(--z-dialog-popover)",
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, idealLeft)),
        ...(placeAbove ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(minimumHeight, topSpace) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(minimumHeight, bottomSpace) }),
    };
}
