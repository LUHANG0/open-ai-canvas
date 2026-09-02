import { useCallback } from "react";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

type MutableValue<T> = { current: T };
type CanvasImportSource = "LibTV" | "TapNow";

type CanvasImportTransactionOptions = {
    source: CanvasImportSource;
    importedNodes: CanvasNodeData[];
    importedConnections: CanvasConnection[];
    nodesRef: MutableValue<CanvasNodeData[]>;
    connectionsRef: MutableValue<CanvasConnection[]>;
    setNodes: (nodes: CanvasNodeData[]) => void;
    setConnections: (connections: CanvasConnection[]) => void;
    saveCanvasProject: () => Promise<boolean>;
};

type UseCanvasProjectImportOptions = Pick<CanvasImportTransactionOptions, "nodesRef" | "connectionsRef" | "setNodes" | "setConnections" | "saveCanvasProject">;

export async function applyCanvasImportTransaction({
    source,
    importedNodes,
    importedConnections,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    saveCanvasProject,
}: CanvasImportTransactionOptions) {
    const previousNodes = nodesRef.current;
    const previousConnections = connectionsRef.current;
    const nextNodes = [...previousNodes, ...importedNodes];
    const nextConnections = [...previousConnections, ...importedConnections];
    nodesRef.current = nextNodes;
    connectionsRef.current = nextConnections;
    setNodes(nextNodes);
    setConnections(nextConnections);
    const saved = await saveCanvasProject();
    if (saved) return;
    nodesRef.current = previousNodes;
    connectionsRef.current = previousConnections;
    setNodes(previousNodes);
    setConnections(previousConnections);
    throw new Error(`画布保存失败，已撤销本次 ${source} 导入`);
}

export function useCanvasProjectImport(options: UseCanvasProjectImportOptions) {
    const applyImport = useCallback(
        (source: CanvasImportSource, importedNodes: CanvasNodeData[], importedConnections: CanvasConnection[]) =>
            applyCanvasImportTransaction({ source, importedNodes, importedConnections, ...options }),
        [options.connectionsRef, options.nodesRef, options.saveCanvasProject, options.setConnections, options.setNodes],
    );

    const applyLibTVImport = useCallback((nodes: CanvasNodeData[], connections: CanvasConnection[]) => applyImport("LibTV", nodes, connections), [applyImport]);
    const applyTapNowImport = useCallback((nodes: CanvasNodeData[], connections: CanvasConnection[]) => applyImport("TapNow", nodes, connections), [applyImport]);

    return { applyLibTVImport, applyTapNowImport };
}
