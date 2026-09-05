import { useCanvasTheme } from "@/components/canvas/canvas-theme-provider";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { ChevronDown, Ellipsis, Lock, Unlock } from "lucide-react";

import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import { resolveToolbarTools, type ToolContext, type ToolbarHandlers } from "@/lib/canvas/tool-registry";
import { subscribeCanvasViewportPreview } from "@/lib/canvas/canvas-live-viewport";
import { useCopyText } from "@/hooks/use-copy-text";
import { CanvasNodeType, type CanvasNodeData, type CanvasWorkspaceMode, type ViewportTransform } from "@/types/canvas";
import { buildImageToolbarTools } from "./canvas-image-toolbar-tools";

type CanvasNodeToolbarProps = {
    node: CanvasNodeData | null;
    viewport: ViewportTransform;
    containerRef: RefObject<HTMLDivElement | null>;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    onInfo: (node: CanvasNodeData) => void;
    onEditText: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onAnnotate: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onEmotion: (node: CanvasNodeData) => void;
    onPortraitTexture: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onSuperResolve: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onExtractVideoFrames: (node: CanvasNodeData) => void;
    onExtractAudioFromVideo: (node: CanvasNodeData) => void;
    onTrimVideoSegments: (node: CanvasNodeData) => void;
    onSubtitles: (node: CanvasNodeData) => void;
    onTimeline: (node: CanvasNodeData) => void;
    extractingVideoFrames: boolean;
    extractingAudio: boolean;
    trimmingVideo: boolean;
    onReversePrompt: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onToggleLocked: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
    workspaceMode?: CanvasWorkspaceMode;
};

type ToolbarTool = {
    id: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    disabledReason?: string;
};

export function CanvasNodeToolbar({
    node,
    viewport,
    containerRef,
    onKeep,
    onLeave,
    onInfo,
    onEditText,
    onDecreaseFont,
    onIncreaseFont,
    onToggleDialog,
    onAnnotate,
    onGenerateImage,
    onUpload,
    onDownload,
    onSaveAsset,
    onMaskEdit,
    onEmotion,
    onPortraitTexture,
    onCrop,
    onSplit,
    onUpscale,
    onSuperResolve,
    onAngle,
    onViewImage,
    onExtractVideoFrames,
    onExtractAudioFromVideo,
    onTrimVideoSegments,
    onSubtitles,
    onTimeline,
    extractingVideoFrames,
    extractingAudio,
    trimmingVideo,
    onReversePrompt,
    onRetry,
    onToggleFreeResize,
    onToggleLocked,
    onDelete,
    workspaceMode = "professional",
}: CanvasNodeToolbarProps) {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const { message } = App.useApp();
    const copyText = useCopyText();
    const theme = useCanvasTheme();
    const simpleMode = workspaceMode === "simple";

    useEffect(() => {
        setOpenMenuId(null);
    }, [node?.id]);

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!node || !container) {
            setAnchor(null);
            return;
        }
        const element = container.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(node.id)}"]`);
        if (!element) {
            setAnchor(null);
            return;
        }
        const update = () => {
            const nodeRect = element.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const preferredLeft = nodeRect.left - containerRect.left + nodeRect.width / 2;
            const toolbarWidth = toolbarRef.current?.offsetWidth || 0;
            const halfToolbar = toolbarWidth / 2;
            const canClamp = toolbarWidth > 0 && toolbarWidth <= containerRect.width - 20;
            const left = canClamp ? Math.min(Math.max(preferredLeft, halfToolbar + 10), containerRect.width - halfToolbar - 10) : preferredLeft;
            const top = nodeRect.top - containerRect.top - 30;
            if (toolbarRef.current) {
                toolbarRef.current.style.left = `${left}px`;
                toolbarRef.current.style.top = `${top}px`;
                return;
            }
            setAnchor((current) => current?.left === left && current.top === top ? current : { left, top });
        };
        update();
        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(element);
        resizeObserver.observe(container);
        if (toolbarRef.current) resizeObserver.observe(toolbarRef.current);
        const viewportLayer = element.parentElement;
        const mutationObserver = new MutationObserver(update);
        if (viewportLayer) mutationObserver.observe(viewportLayer, { attributes: true, attributeFilter: ["style"] });
        const unsubscribeViewport = subscribeCanvasViewportPreview(container, update);
        window.addEventListener("resize", update);
        return () => {
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            unsubscribeViewport();
            window.removeEventListener("resize", update);
        };
    }, [anchor === null, containerRef, node, viewport.k, viewport.x, viewport.y]);

    if (!node || !anchor) return null;

    const isImage = node.type === CanvasNodeType.Image;
    const isVideo = node.type === CanvasNodeType.Video;
    const isAudio = node.type === CanvasNodeType.Audio;
    const hasImage = isImage && Boolean(node.metadata?.content);
    const isText = node.type === CanvasNodeType.Text;
    const isCharacterReference = isText && node.metadata?.workflowKind === "character" && Boolean(node.metadata.characterAssetId);
    const isEditableText = isText && !isCharacterReference;
    const copyImagePrompt = (target: CanvasNodeData) => {
        const prompt = target.metadata?.prompt?.trim();
        if (!prompt) {
            message.warning("暂无可复制的提示词");
            return;
        }
        copyText(prompt, "提示词已复制");
    };
    const imageTools = buildImageToolbarTools(node, { onUpload, onToggleFreeResize, onAnnotate, onMaskEdit, onEmotion, onPortraitTexture, onCrop, onSplit, onUpscale, onSuperResolve, onAngle, onViewImage, onCopyPrompt: copyImagePrompt, onReversePrompt });

    // 构建 ToolContext——供注册表解析工具
    const nodeHoverHandlers = {
        onNodeInfo: onInfo, onNodeDelete: onDelete, onNodeRetry: onRetry, onNodeEditText: onEditText, onNodeDecreaseFont: onDecreaseFont, onNodeIncreaseFont: onIncreaseFont,
        onNodeToggleDialog: onToggleDialog, onNodeAnnotate: onAnnotate, onNodeGenerateImage: onGenerateImage, onNodeUpload: onUpload, onNodeDownload: onDownload,
        onNodeSaveAsset: onSaveAsset, onNodeMaskEdit: onMaskEdit, onNodeEmotion: onEmotion, onNodePortraitTexture: onPortraitTexture, onNodeCrop: onCrop,
        onNodeSplit: onSplit, onNodeUpscale: onUpscale, onNodeSuperResolve: onSuperResolve, onNodeAngle: onAngle, onNodeViewImage: onViewImage,
        onNodeExtractVideoFrames: onExtractVideoFrames, onNodeExtractAudioFromVideo: onExtractAudioFromVideo, onNodeTrimVideoSegments: onTrimVideoSegments, onNodeReversePrompt: onReversePrompt, onNodeToggleFreeResize: onToggleFreeResize,
        onNodeSubtitles: onSubtitles, onNodeTimeline: onTimeline, onNodeToggleLocked: onToggleLocked, onNodeCopyPrompt: copyImagePrompt,
    } as Partial<ToolbarHandlers> as ToolbarHandlers;

    const nodeHoverCtx: ToolContext = {
        selectedCount: 0,
        selectedNodeTypes: new Set(),
        selectedVideoCount: 0,
        canvasTool: "move",
        workspaceMode: workspaceMode || "professional",
        isProjectLinked: false,
        canUndo: false,
        canRedo: false,
        node,
        nodeMetadata: node.metadata,
        extractingVideoFrames,
        extractingAudio,
        trimmingVideo,
        mergingVideos: false,
        addPanelOpen: false,
        appearancePanelOpen: false,
        settingsPanelOpen: false,
        handlers: nodeHoverHandlers,
    };

    // 注册表只负责动作合同与适用性，Dock 的业务分组在此处唯一确定。
    const registryTools = resolveToolbarTools("node-hover", nodeHoverCtx, null);
    // 锁定始终放在菜单末尾，避免与业务工具混排。
    const otherRegistryTools = registryTools.filter((tool) => tool.id !== "node-lock");
    // 转为 ToolbarTool 供组件内部逻辑使用
    const otherTools: ToolbarTool[] = otherRegistryTools.map((tool) => ({
        id: tool.id,
        label: tool.displayLabel ? (typeof tool.displayLabel === "function" ? tool.displayLabel(nodeHoverCtx) : tool.displayLabel) : (typeof tool.label === "function" ? tool.label(nodeHoverCtx) : tool.label),
        icon: typeof tool.icon === "function" ? tool.icon(nodeHoverCtx) : tool.icon,
        active: tool.active?.(nodeHoverCtx),
        danger: tool.danger,
        disabled: tool.disabled?.(nodeHoverCtx),
        disabledReason: tool.disabledReason?.(nodeHoverCtx),
        onClick: () => tool.run(nodeHoverCtx),
    }));
    const allTools: ToolbarTool[] = hasImage && !simpleMode
        ? [...otherTools, ...imageTools.map((tool) => ({ id: tool.id, label: tool.label, icon: tool.icon, disabled: tool.disabled, disabledReason: tool.disabledReason, onClick: tool.onClick }))]
        : otherTools;
    const toolById = new Map(allTools.map((tool) => [tool.id, tool]));
    const takeTools = (ids: string[]) => ids.map((id) => toolById.get(id)).filter((tool): tool is ToolbarTool => Boolean(tool));
    const imageBaseTools = takeTools(hasImage ? ["delete", "download"] : ["delete", "uploadImage"]);
    const imageEditTools = takeTools(["maskEdit", "crop", "split"]);
    const imagePortraitTools = takeTools(["emotion", "portraitTexture"]).map((tool) => tool.id === "emotion" ? { ...tool, label: "人物情绪" } : tool);
    const imageAngleTool = toolById.get("angle");
    const videoTools = takeTools(["download", "timeline", "subtitles", "extractFrames", "extractAudio", "trimRegenerate", "uploadVideo"]).map((tool) => {
        if (tool.id === "extractFrames") return { ...tool, label: "提取画面" };
        if (tool.id === "trimRegenerate") return { ...tool, label: "截取片段" };
        if (tool.id === "uploadVideo") return { ...tool, label: "替换视频" };
        return tool;
    });
    const videoPrimaryTools = videoTools.filter((tool) => ["download", "timeline"].includes(tool.id));
    const videoProcessTools = videoTools.filter((tool) => ["subtitles", "extractFrames", "extractAudio", "trimRegenerate"].includes(tool.id));
    const videoReplaceTool = videoTools.find((tool) => tool.id === "uploadVideo");
    const genericTools = takeTools(isAudio ? ["delete", "download", "timeline", "uploadAudio"] : isEditableText ? ["delete", "edit", "editText", "generateImage", "saveAsset"] : ["delete", "info", "config"]);
    const visibleToolIds = new Set([
        ...(isImage ? [...imageBaseTools, ...imageEditTools, ...imagePortraitTools, ...(imageAngleTool ? [imageAngleTool] : [])] : isVideo ? [...videoPrimaryTools, ...videoProcessTools, ...(videoReplaceTool ? [videoReplaceTool] : [])] : genericTools).map((tool) => tool.id),
    ]);
    const overflowTools = allTools
        .filter((tool) => !visibleToolIds.has(tool.id))
        .map((tool) => tool.id === "edit" && (isImage || isVideo) ? { ...tool, label: "生成设置" } : tool);
    const lockTool: ToolbarTool = {
        id: "node-lock",
        label: node.metadata?.locked ? "解锁" : "锁定",
        icon: node.metadata?.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />,
        active: Boolean(node.metadata?.locked),
        onClick: () => onToggleLocked(node),
    };
    const handleMenuOpenChange = (menuId: string, open: boolean) => {
        setOpenMenuId((current) => open ? menuId : current === menuId ? null : current);
        if (open) onKeep(node.id);
        else onLeave();
    };
    const dockStyle = canvasDockStyle(theme, theme.node.text);

    return (
        <div
            ref={toolbarRef}
            className="canvas-node-toolbar absolute z-[var(--z-node-toolbar)] -translate-x-1/2 -translate-y-full"
            style={{ left: anchor.left, top: anchor.top, width: "max-content", maxWidth: "min(calc(100% - 20px), 960px)", color: theme.node.text }}
            onMouseEnter={() => onKeep(node.id)}
            onMouseLeave={() => { if (!openMenuId) onLeave(); }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div
                role="toolbar"
                aria-label="节点快捷工具"
                className="thin-scrollbar flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-[var(--dock-radius-tight)] px-2 backdrop-blur-2xl"
                style={{ ...dockStyle, border: 0 }}
            >
                {isImage ? (
                    <>
                        {imageBaseTools.map((tool) => <NodeDockToolButton key={tool.id} tool={tool} />)}
                        {imageEditTools.length ? <NodeDockMenuButton menuId="image-edit" label="编辑" icon={imageEditTools[0].icon} tools={imageEditTools} openMenuId={openMenuId} onOpenChange={handleMenuOpenChange} /> : null}
                        {imagePortraitTools.length ? <NodeDockMenuButton menuId="image-portrait" label="人物调整" icon={imagePortraitTools[0].icon} tools={imagePortraitTools} openMenuId={openMenuId} onOpenChange={handleMenuOpenChange} /> : null}
                        {imageAngleTool ? <NodeDockToolButton tool={imageAngleTool} /> : null}
                    </>
                ) : isVideo ? (
                    <>
                        {videoPrimaryTools.map((tool) => <NodeDockToolButton key={tool.id} tool={tool} />)}
                        {videoProcessTools.length ? <NodeDockMenuButton menuId="video-process" label="视频处理" icon={videoProcessTools[0].icon} tools={videoProcessTools} openMenuId={openMenuId} onOpenChange={handleMenuOpenChange} /> : null}
                        {videoReplaceTool ? <NodeDockToolButton tool={videoReplaceTool} /> : null}
                    </>
                ) : genericTools.map((tool) => <NodeDockToolButton key={tool.id} tool={tool} />)}
                <span aria-hidden className="aceternity-dock-separator mx-1.5 h-6 w-px shrink-0" />
                <NodeDockToolButton tool={lockTool} />
                {overflowTools.length ? (
                    <NodeDockMenuButton menuId="more" label="更多" icon={<Ellipsis className="size-3.5" />} tools={overflowTools} openMenuId={openMenuId} onOpenChange={handleMenuOpenChange} placement="topRight" />
                ) : null}
            </div>
        </div>
    );
}

function NodeDockToolButton({ tool }: { tool: ToolbarTool }) {
    return (
        <button
            type="button"
            className={`aceternity-dock-command is-labeled pointer-events-auto inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[var(--dock-item-radius)] px-2.5 outline-none ${tool.active ? "is-active" : ""} ${tool.danger ? "is-danger" : ""}`}
            aria-label={tool.label}
            aria-pressed={tool.active || undefined}
            disabled={tool.disabled}
            title={tool.disabledReason}
            // 节点工具栏会跟随悬浮节点定位；鼠标移动到工具栏时节点悬浮态可能先变化。
            // 指针操作在按下阶段提交，避免按钮在 pointerup 前被重排/隐藏而吞掉点击；
            // 键盘 Enter/Space 仍通过 detail=0 的 click 触发同一动作。
            onMouseDown={(event) => {
                if (event.button !== 0 || tool.disabled) return;
                event.preventDefault();
                event.stopPropagation();
                tool.onClick();
            }}
            onClick={(event) => {
                if (event.detail === 0 && !tool.disabled) tool.onClick();
            }}
        >
            <span className="grid size-3.5 shrink-0 place-items-center">{tool.icon}</span>
            <span className="inline-flex h-4 items-center whitespace-nowrap text-[var(--fs-label)] font-medium leading-none">{tool.label}</span>
        </button>
    );
}

function NodeDockMenuButton({ menuId, label, icon, tools, openMenuId, onOpenChange, placement = "top" }: { menuId: string; label: string; icon: ReactNode; tools: ToolbarTool[]; openMenuId: string | null; onOpenChange: (menuId: string, open: boolean) => void; placement?: "top" | "topRight" }) {
    const open = openMenuId === menuId;
    const items: MenuProps["items"] = tools.map((tool) => ({ key: tool.id, icon: tool.icon, label: tool.label, title: tool.disabledReason, disabled: tool.disabled, onClick: tool.onClick }));
    return (
        <Dropdown open={open} trigger={["click"]} placement={placement} onOpenChange={(nextOpen) => onOpenChange(menuId, nextOpen)} menu={{ items }}>
            <button
                type="button"
                className={`aceternity-dock-command is-labeled pointer-events-auto inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[var(--dock-item-radius)] px-2.5 outline-none ${open ? "is-active" : ""}`}
                aria-label={label}
                aria-expanded={open}
            >
                <span className="grid size-3.5 shrink-0 place-items-center">{icon}</span>
                <span className="inline-flex h-4 items-center whitespace-nowrap text-[var(--fs-label)] font-medium leading-none">{label}</span>
                <ChevronDown className="size-3 shrink-0 opacity-55" />
            </button>
        </Dropdown>
    );
}
