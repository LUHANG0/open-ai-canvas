import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { App } from "antd";

import { failedImageBatchChildren, markImageBatchRetrying, reconcileImageBatchRoot, restoreUnsubmittedImageBatchChild } from "@/lib/canvas/canvas-image-batch-retry";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type CanvasNodeRetryPlan =
    | { kind: "script"; nodeId: string; prompt: string }
    | { kind: "script-missing-prompt" }
    | { kind: "image-batch"; rootId: string; children: CanvasNodeData[]; announceCount: boolean }
    | { kind: "image-batch-empty" }
    | { kind: "generation"; node: CanvasNodeData };

export function resolveCanvasNodeRetryPlan(node: CanvasNodeData, nodes: CanvasNodeData[]): CanvasNodeRetryPlan {
    if (node.type === CanvasNodeType.Script) {
        const prompt = (node.metadata?.composerContent || node.metadata?.prompt || "").trim();
        return prompt ? { kind: "script", nodeId: node.id, prompt } : { kind: "script-missing-prompt" };
    }
    if (node.type === CanvasNodeType.Image && node.metadata?.isBatchRoot) {
        const children = failedImageBatchChildren(node, nodes);
        return children.length ? { kind: "image-batch", rootId: node.id, children, announceCount: true } : { kind: "image-batch-empty" };
    }
    if (node.type === CanvasNodeType.Image && node.metadata?.batchRootId) {
        return { kind: "image-batch", rootId: node.metadata.batchRootId, children: [node], announceCount: false };
    }
    return { kind: "generation", node };
}

type UseCanvasNodeRetryOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    generateScriptRows: (nodeId: string, prompt: string) => unknown | Promise<unknown>;
    retryGenerationNode: (node: CanvasNodeData) => unknown | Promise<unknown>;
};

export function useCanvasNodeRetry({ nodesRef, setNodes, generateScriptRows, retryGenerationNode }: UseCanvasNodeRetryOptions) {
    const { message } = App.useApp();

    const reconcileImageBatchRootNode = useCallback(
        (rootId: string) => {
            setNodes((current) => {
                const root = current.find((item) => item.id === rootId);
                if (!root) return current;
                const reconciled = reconcileImageBatchRoot(root, current);
                return current.map((item) => (item.id === root.id ? reconciled : item));
            });
        },
        [setNodes],
    );

    const retryImageBatchChildren = useCallback(
        (rootId: string, children: CanvasNodeData[]) => {
            const childIds = children.map((child) => child.id);
            setNodes((current) => markImageBatchRetrying(rootId, childIds, current));
            void Promise.allSettled(
                children.map(async (child) => {
                    await retryGenerationNode(child);
                    setNodes((current) => current.map((item) => (item.id === child.id ? restoreUnsubmittedImageBatchChild(item, child) : item)));
                }),
            ).finally(() => reconcileImageBatchRootNode(rootId));
        },
        [reconcileImageBatchRootNode, retryGenerationNode, setNodes],
    );

    return useCallback(
        (node: CanvasNodeData) => {
            const plan = resolveCanvasNodeRetryPlan(node, nodesRef.current);
            if (plan.kind === "script-missing-prompt") {
                message.warning("分镜脚本缺少剧情内容，无法重试");
                return;
            }
            if (plan.kind === "script") {
                void generateScriptRows(plan.nodeId, plan.prompt);
                return;
            }
            if (plan.kind === "image-batch-empty") {
                message.info("当前批次没有需要重试的失败图片");
                return;
            }
            if (plan.kind === "image-batch") {
                if (plan.announceCount) message.info(`正在重试 ${plan.children.length} 个失败图片`);
                retryImageBatchChildren(plan.rootId, plan.children);
                return;
            }
            void retryGenerationNode(plan.node);
        },
        [generateScriptRows, message, nodesRef, retryGenerationNode, retryImageBatchChildren],
    );
}
