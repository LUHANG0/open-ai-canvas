export type CanvasInputPlatform = "mac" | "other";

/** Browser-only detection; SSR and non-Mac platforms retain the Ctrl-style labels. */
export function getCanvasInputPlatform(): CanvasInputPlatform {
    if (typeof navigator === "undefined") return "other";
    const browser = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = browser.userAgentData?.platform || browser.platform || browser.userAgent;
    return /mac/i.test(platform) ? "mac" : "other";
}

/** Control + primary click is a secondary click on macOS, never a canvas drag. */
export function isCanvasSecondaryClick(
    event: { button: number; ctrlKey?: boolean },
    platform: CanvasInputPlatform = getCanvasInputPlatform(),
): boolean {
    return event.button === 2 || (platform === "mac" && event.button === 0 && event.ctrlKey === true);
}

export function formatCanvasShortcutKey(key: string, platform: CanvasInputPlatform = getCanvasInputPlatform()): string {
    switch (key.toLowerCase()) {
        case "ctrl":
        case "control":
        case "cmd":
        case "command":
        case "meta":
        case "mod":
        case "ctrl/cmd":
            return platform === "mac" ? "⌘" : "Ctrl";
        case "alt":
        case "option":
            return platform === "mac" ? "⌥" : "Alt";
        case "shift":
            return platform === "mac" ? "⇧" : "Shift";
        case "delete":
            return platform === "mac" ? "⌫" : "Delete";
        case "backspace":
            return platform === "mac" ? "⌫" : "Backspace";
        case "enter":
        case "return":
            return platform === "mac" ? "↵" : "Enter";
        case "escape":
        case "esc":
            return "Esc";
        default:
            return key;
    }
}
