import type { Transition } from "motion/react";

/** Feed the existing CSS motion tokens into Motion's layout projection. */
export function workspaceSidebarMotion(style: Pick<CSSStyleDeclaration, "getPropertyValue">, enabled: boolean): Transition {
    const seconds = (token: string) => Number.parseFloat(token) / (token.trim().endsWith("ms") ? 1000 : 1);
    const controlDuration = seconds(style.getPropertyValue("--control-motion-duration"));
    const baseDuration = seconds(style.getPropertyValue("--motion-dur-base"));
    const duration = Number.isFinite(baseDuration) ? baseDuration : controlDuration;
    const curve = style.getPropertyValue("--motion-ease-out").match(/cubic-bezier\(([^)]+)\)/)?.[1].split(",").map(Number);
    return {
        type: "tween",
        duration: enabled && controlDuration > 0 && Number.isFinite(duration) ? duration : 0,
        ease: curve?.length === 4 && curve.every(Number.isFinite) ? curve as [number, number, number, number] : "linear",
    };
}
