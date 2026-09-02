import { expect, test } from "bun:test";

test("toolbar settings modal loads only after customization opens", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain('lazy(() => import("@/components/canvas/toolbars/toolbar-settings-modal")');
    expect(source).not.toContain('import { ToolbarSettingsModal } from "@/components/canvas/toolbars/toolbar-settings-modal"');
    expect(source).toContain("settingsOpen ? (");
    expect(source).toContain("<Suspense fallback={<ToolbarSettingsLoading x={panelX} onClose={() => setSettingsOpen(false)} />}>");
    expect(source).toContain('<ToolbarSettingsModal open onClose={() => setSettingsOpen(false)} toolbar="main" />');
});

test("main toolbar and primary creation actions stay eager", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain('import { FloatingDock } from "@/components/ui/aceternity/floating-dock"');
    expect(source).toContain('import { CanvasCreateMenu, type CanvasCreateCommand } from "@/components/canvas/canvas-create-menu"');
    expect(source).toContain("onToolChange");
    expect(source).toContain("onUndo");
    expect(source).toContain("onRedo");
    expect(source).toContain("resolveAddNodeMenuCommands");
    expect(source).toContain("<FloatingDock ref={dockRef}");
    expect(source).toContain("magnify={false}");
});

test("toolbar preferences and settings callbacks remain intact", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain('const [prefs, setPrefs] = useState<ToolbarPrefs | null>(() => readToolbarPrefs("main"))');
    expect(source).toContain('if (!settingsOpen) setPrefs(readToolbarPrefs("main"))');
    expect(source).toContain("setMoreOpen(false);");
    expect(source).toContain("setSettingsOpen(true);");
    expect(source).toContain("onBackgroundModeChange");
    expect(source).toContain("onShowImageInfoChange");
    expect(source).toContain("setTheme");
    expect(source).toContain('defaultToolbarPrefs("main")');
});

test("settings loading fallback is local, dismissible, and leaves the dock usable", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain("function ToolbarSettingsLoading");
    expect(source).toContain("pc-canvas-toolbar__popover pointer-events-auto absolute bottom-[var(--canvas-dock-popover-offset)]");
    expect(source).not.toContain("fixed inset-0");
    expect(source).toContain("onClick={onClose}");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
});
