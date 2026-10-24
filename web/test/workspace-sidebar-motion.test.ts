import { expect, test } from "bun:test";
import { workspaceSidebarMotion } from "../src/lib/workspace-sidebar-motion";

const tokens = (duration: string, easing = "cubic-bezier(0.22, 1, 0.36, 1)", base = "") => ({ getPropertyValue: (name: string) => ({ "--control-motion-duration": duration, "--motion-ease-out": easing, "--motion-dur-base": base })[name] || "" });

test("sidebar layout projection uses the existing CSS duration and easing", () => {
    expect(workspaceSidebarMotion(tokens("150ms"), true)).toEqual({ type: "tween", duration: 0.15, ease: [0.22, 1, 0.36, 1] });
    expect(workspaceSidebarMotion(tokens("0.2s"), true).duration).toBe(0.2);
    expect(workspaceSidebarMotion(tokens("150ms", undefined, "250ms"), true).duration).toBe(0.25);
});

test("keyboard, reduced motion and unavailable CSS tokens keep immediate layout", () => {
    expect(workspaceSidebarMotion(tokens("150ms"), false).duration).toBe(0);
    expect(workspaceSidebarMotion(tokens("0s"), true).duration).toBe(0);
    expect(workspaceSidebarMotion(tokens("0s", undefined, "250ms"), true).duration).toBe(0);
    expect(workspaceSidebarMotion(tokens("", ""), true).duration).toBe(0);
});
