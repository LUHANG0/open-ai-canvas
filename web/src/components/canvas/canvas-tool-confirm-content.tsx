import type { ReactNode } from "react";

/** 工具内确认框的首尾 Tab 保持在决策按钮之间，避免进入被遮住的画布。 */
export function CanvasToolConfirmContent({ children }: { children: ReactNode }) {
    return <div onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])")).filter((button) => button.getClientRects().length > 0);
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>{children}</div>;
}
