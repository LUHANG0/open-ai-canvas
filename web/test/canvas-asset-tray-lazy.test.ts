import { expect, test } from "bun:test";

test("canvas asset tray keeps only its trigger eager and preserves panel state after first open", async () => {
    const traySource = await Bun.file(new URL("../src/components/canvas/canvas-asset-tray.tsx", import.meta.url)).text();
    const contentSource = await Bun.file(new URL("../src/components/canvas/canvas-asset-tray-content.tsx", import.meta.url)).text();

    expect(traySource).toContain('lazy(() => import("./canvas-asset-tray-content")');
    expect(traySource).toContain("const [hasOpened, setHasOpened] = useState(false)");
    expect(traySource).toContain("if (!open) setHasOpened(true)");
    expect(traySource).toContain("{hasOpened ? (");
    expect(traySource).toContain("<CanvasAssetTrayContent");
    expect(traySource).toContain("open={open}");
    expect(traySource).toContain("fallback={open ? <CanvasAssetTrayLoading theme={theme} /> : null}");
    expect(traySource).toContain("pointer-events-none absolute bottom-[var(--canvas-dock-popover-offset)] left-0");
    expect(traySource).not.toContain('from "motion/react"');
    expect(traySource).not.toContain("CachedResourceImage");
    expect(traySource).not.toContain('type="search"');
    expect(traySource).toContain("export const CANVAS_IMAGE_ASSET_DND_TYPE");
    expect(traySource).toContain("showLibrary={showLibrary}");

    expect(contentSource).toContain('from "motion/react"');
    expect(contentSource).toContain("CachedResourceImage");
    expect(contentSource).toContain('type="search"');
    expect(contentSource).toContain('type TrayTab = "library" | "canvas"');
    expect(contentSource).toContain("const [tab, setTab] = useState<TrayTab>(initialTab)");
    expect(contentSource).toContain('const [keyword, setKeyword] = useState("")');
    expect(contentSource).toContain("const [trayHeight, setTrayHeight]");
    expect(contentSource).toContain("onDragStartCapture={onDragStart}");
    expect(contentSource).toContain('if (!showLibrary && tab === "library") setTab("canvas")');
    expect(contentSource).toContain('if (event.key === "Escape") onClose()');
});
