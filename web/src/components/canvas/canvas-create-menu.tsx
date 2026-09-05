import { useCanvasTheme } from "@/components/canvas/canvas-theme-provider";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { aceternityMotion } from "@/lib/aceternity-motion";
import { cn } from "@/lib/utils";

export type CanvasCreateCommand = {
    id: string;
    label: string;
    icon: ReactNode;
    badge?: string;
    section: "node" | "workflow" | "project" | "resource";
    onClick: () => void;
};

type CanvasCreateMenuProps = {
    commands: CanvasCreateCommand[];
    variant?: "dock" | "context";
    onBack?: () => void;
};

const primaryNodeIds = new Set(["text", "image", "video", "audio"]);
const structureNodeIds = new Set(["drawing", "script", "frame", "folder"]);
const advancedNodeIds = new Set(["director"]);

export function CanvasCreateMenu({ commands, variant = "dock", onBack }: CanvasCreateMenuProps) {
    const theme = useCanvasTheme();
    const projectCommands = commands.filter((command) => command.section === "project");
    const nodeCommands = commands.filter((command) => command.section === "node");
    const workflowCommands = commands.filter((command) => command.section === "workflow");
    const resourceCommands = commands.filter((command) => command.section === "resource");
    const primaryCommands = nodeCommands.filter((command) => primaryNodeIds.has(command.id));
    const structureCommands = nodeCommands.filter((command) => structureNodeIds.has(command.id));
    const advancedCommands = [...nodeCommands.filter((command) => advancedNodeIds.has(command.id)), ...workflowCommands];
    const knownNodeIds = new Set([...primaryNodeIds, ...structureNodeIds, ...advancedNodeIds]);
    const extensionCommands = nodeCommands.filter((command) => !knownNodeIds.has(command.id));

    return (
        <div className={`canvas-create-menu canvas-create-menu-${variant}`}>
            <header className="sticky top-0 z-10 flex min-h-9 items-center gap-2 border-b px-1 pb-2" style={{ borderColor: theme.toolbar.border, background: theme.spatial.elevated }}>
                {onBack ? (
                    <button type="button" className="grid size-7 shrink-0 place-items-center rounded-lg outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/8" style={{ "--tw-ring-color": theme.node.muted } as CSSProperties} aria-label="返回画布命令" onClick={onBack}>
                        <ArrowLeft className="size-4" />
                    </button>
                ) : null}
                <span className="min-w-0">
                    <h2 className="font-semibold leading-none" style={{ fontSize: "var(--fs-caption)" }}>添加节点</h2>
                    <span className="mt-1 block text-[var(--fs-micro)]" style={{ color: theme.node.muted }}>选择节点类型或导入已有资源</span>
                </span>
            </header>

            <div className="thin-scrollbar max-h-[min(560px,calc(100vh-120px))] overflow-y-auto px-0.5 pb-1">
                {primaryCommands.length ? <MenuGroup title="常用创作" commands={primaryCommands} kind="node" menuVariant={variant} /> : null}
                {structureCommands.length ? <MenuGroup title="剧情与布局" commands={structureCommands} kind="node" menuVariant={variant} /> : null}
                {advancedCommands.length ? <MenuGroup title="高级工具" commands={advancedCommands} kind="detail" menuVariant={variant} /> : null}
                {extensionCommands.length ? <MenuGroup title="扩展节点" commands={extensionCommands} kind="node" menuVariant={variant} /> : null}
                {resourceCommands.length ? <MenuGroup title="导入资源" commands={resourceCommands} kind="detail" menuVariant={variant} /> : null}
                {projectCommands.length ? <MenuGroup title="项目配置" commands={projectCommands} kind="wide" menuVariant={variant} /> : null}
            </div>
        </div>
    );
}

function MenuGroup({ title, commands, kind, menuVariant }: { title: string; commands: CanvasCreateCommand[]; kind: "node" | "detail" | "wide"; menuVariant: "dock" | "context" }) {
    const theme = useCanvasTheme();
    return (
        <section className="mt-3 first:mt-2">
            <MenuSection title={title} color={theme.node.muted} />
            <CanvasCreateCommandGrid commands={commands} kind={kind} menuVariant={menuVariant} />
        </section>
    );
}

function CanvasCreateCommandGrid({ commands, kind, menuVariant }: { commands: CanvasCreateCommand[]; kind: "node" | "detail" | "wide"; menuVariant: "dock" | "context" }) {
    const theme = useCanvasTheme();
    const reducedMotion = useReducedMotion();
    const contextNode = menuVariant === "context" && kind === "node";
    const columns = kind === "wide" ? "grid-cols-1" : kind === "node" ? (contextNode ? "grid-cols-2" : "grid-cols-4") : "grid-cols-2";

    return (
        <div className={cn("grid gap-1.5", columns)}>
            {commands.map((command) => (
                <motion.button
                    key={command.id}
                    type="button"
                    whileHover={reducedMotion ? undefined : { y: -1 }}
                    whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                    transition={aceternityMotion.spring.dock}
                    className={cn(
                        "group min-w-0 overflow-hidden rounded-[var(--dock-item-radius-labeled)] border border-black/10 bg-white/70 outline-none transition-colors hover:border-black/20 hover:bg-black/5 focus-visible:ring-2 dark:border-white/10 dark:bg-white/[.04] dark:hover:border-white/20 dark:hover:bg-white/8",
                        kind === "node" && !contextNode
                            ? "flex h-[64px] flex-col items-center justify-center gap-1.5 px-1.5 text-center"
                            : "flex min-h-[48px] items-center justify-start gap-2.5 px-2.5 py-1.5 text-left",
                    )}
                    style={{ color: theme.node.text, "--tw-ring-color": theme.node.muted } as CSSProperties}
                    title={command.label}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={command.onClick}
                >
                    {kind === "node" && !contextNode ? (
                        <>
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg opacity-70 transition-opacity group-hover:opacity-100 [&_svg]:size-4" style={{ background: theme.toolbar.itemHover }}>{command.icon}</span>
                            <span className="flex max-w-full items-center gap-1 leading-none">
                                <span className="truncate font-semibold" style={{ fontSize: "var(--fs-label)" }}>{command.label}</span>
                                {command.badge ? <span className="shrink-0 text-[var(--fs-micro)] font-medium" style={{ color: theme.node.muted }}>{command.badge}</span> : null}
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg opacity-70 transition-opacity group-hover:opacity-100 [&_svg]:size-4" style={{ background: theme.toolbar.itemHover }}>{command.icon}</span>
                            <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate font-semibold leading-4" style={{ fontSize: "var(--fs-label)" }}>{command.label}</span>
                                    {command.badge ? <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[var(--fs-micro)] font-medium" style={{ background: theme.toolbar.activeBg, color: theme.node.muted }}>{command.badge}</span> : null}
                                </span>
                                <span className="mt-0.5 block truncate text-[var(--fs-micro)] leading-3" style={{ color: theme.node.muted }}>{commandDescription(command.id)}</span>
                            </span>
                        </>
                    )}
                </motion.button>
            ))}
        </div>
    );
}

function MenuSection({ title, color }: { title: string; color: string }) {
    return <h3 className="mb-1.5 px-1 font-semibold leading-none" style={{ color, fontSize: "var(--fs-tiny)" }}>{title}</h3>;
}

function commandDescription(id: string) {
    return ({
        text: "文案与提示词",
        image: "图片生成与处理",
        video: "视频生成与处理",
        audio: "语音与声音素材",
        drawing: "自由绘制内容",
        script: "组织镜头脚本",
        frame: "整理画布区域",
        folder: "收纳关联节点",
        director: "打开 3D 导演台",
        workflow: "编排自动化流程",
        upload: "从本机导入素材",
        assets: "浏览已有素材",
        "project-character": "插入项目角色卡",
        style: "统一项目视觉风格",
    } as Record<string, string>)[id] || "添加到当前画布";
}
