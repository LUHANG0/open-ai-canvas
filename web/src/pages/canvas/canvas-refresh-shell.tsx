import { AppLoading } from "@/components/ui/app-loading";

export function CanvasRefreshShell() {
    return <main className="relative h-full min-h-0 overflow-hidden bg-background text-foreground"><AppLoading label="正在打开画布" className="canvas-entry-loading" /></main>;
}
