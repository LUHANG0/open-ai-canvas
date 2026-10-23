import type { KeyboardEvent } from "react";

// 卡片保持原 DOM 与点击回调；只共享 radio 方向键协议，跳过禁用项及嵌套组。
export function handleAdminRadioKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const current = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[role="radio"]') : null;
    const group = event.currentTarget;
    if (!current || current.closest('[role="radiogroup"]') !== group) return;
    const radios = Array.from(group.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).filter((radio) => !radio.disabled && radio.getAttribute("aria-disabled") !== "true" && radio.closest('[role="radiogroup"]') === group);
    if (!radios.length) return;
    event.preventDefault();
    const index = radios.indexOf(current);
    if (index < 0) return;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? radios.length - 1 : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + radios.length) % radios.length;
    const next = radios[nextIndex];
    next.focus();
    if (next.getAttribute("aria-checked") !== "true") next.click();
}
