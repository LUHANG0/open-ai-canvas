import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";

import { buildCanvasMediaDownloads } from "@/lib/canvas/canvas-media-download";
import { getActiveUserScope } from "@/lib/user-scope";
import { downloadBrowserMediaBatch } from "@/services/browser-download";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasNodeData } from "@/types/canvas";

export function useCanvasMediaDownloads(canvasId: string, canvasTitle: string) {
    const { message } = App.useApp();
    const activeDownload = useRef<AbortController | null>(null);
    const [downloadingSelection, setDownloadingSelection] = useState(false);

    useEffect(() => {
        setDownloadingSelection(false);
        const unsubscribe = useUserStore.subscribe((next, previous) => {
            // Hydration starts before the storage scope changes. Abort even if the user later switches back.
            if (next.user?.id !== previous.user?.id || (!next.hydrated && previous.hydrated)) activeDownload.current?.abort();
        });
        return () => {
            unsubscribe();
            activeDownload.current?.abort();
            activeDownload.current = null;
        };
    }, [canvasId]);

    const downloadNodesMedia = useCallback(async (nodes: CanvasNodeData[]) => {
        if (activeDownload.current && !activeDownload.current.signal.aborted) return;
        const items = buildCanvasMediaDownloads(canvasTitle, nodes);
        if (!items.length) {
            message.warning("选区内没有可下载的媒体，请等待生成、上传或合成完成后重试");
            return;
        }
        const controller = new AbortController();
        const scope = getActiveUserScope();
        activeDownload.current = controller;
        setDownloadingSelection(true);
        const closeProgress = message.loading(`正在启动 ${items.length} 个文件下载…`, 0);
        try {
            const result = await downloadBrowserMediaBatch(items, { signal: controller.signal });
            if (result.cancelled || controller.signal.aborted || getActiveUserScope() !== scope) return;
            const skipped = nodes.length - items.length;
            const skippedNote = skipped ? `，已跳过 ${skipped} 个非媒体、空白或未完成的节点` : "";
            if (!result.started) message.error(`下载未能启动，${result.failed} 个文件失败，请重试`);
            else if (result.failed) message.warning(`已开始下载 ${result.started} 个文件，${result.failed} 个失败${skippedNote}`);
            else message.success(`已开始下载 ${result.started} 个文件${skippedNote}`);
        } catch {
            if (!controller.signal.aborted && getActiveUserScope() === scope) message.error("下载未能启动，请稍后重试");
        } finally {
            closeProgress();
            if (activeDownload.current === controller) {
                activeDownload.current = null;
                setDownloadingSelection(false);
            }
        }
    }, [canvasTitle, message]);

    return { downloadNodesMedia, downloadingSelection };
}
