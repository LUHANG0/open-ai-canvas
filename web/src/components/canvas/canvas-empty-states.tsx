import type { CSSProperties, ReactNode } from "react";
import { Dropdown } from "antd";
import { ArrowRight, Bot, ChevronDown, Clapperboard, FolderKanban, Images, MoreHorizontal, Plus, Type, Upload } from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function CanvasLinkedProjectEmptyState({ projectName, hasChapter, onAddFirstChapter, onOpenAssets, onAddText }: { projectName: string; hasChapter: boolean; onAddFirstChapter: () => void; onOpenAssets: () => void; onAddText: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-16 pt-20">
            <div className="pointer-events-auto w-full max-w-[440px] rounded-lg border p-3 shadow-sm backdrop-blur" data-canvas-no-zoom style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                <div className="flex items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}><FolderKanban className="size-4" /></span><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{projectName}</h2><p className="mt-0.5 text-[var(--fs-label)]" style={{ color: theme.node.muted }}>项目画布为空</p></div></div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <button type="button" disabled={!hasChapter} onClick={onAddFirstChapter} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium disabled:opacity-35" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><Plus className="size-3.5 shrink-0" /><span className="truncate">添加首章</span></button>
                    <button type="button" onClick={onOpenAssets} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><Images className="size-3.5 shrink-0" /><span className="truncate">项目资产</span></button>
                    <button type="button" onClick={onAddText} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><Type className="size-3.5 shrink-0" /><span className="truncate">新建文本</span></button>
                </div>
            </div>
        </div>
    );
}

export function CanvasShortDramaEmptyState({ onCreatePipeline, onOpenAgent, onUpload, onAddText, onAddScript }: {
    onCreatePipeline: () => void;
    onOpenAgent: () => void;
    onUpload: () => void;
    onAddText: () => void;
    onAddScript: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const focusStyle = { "--tw-ring-color": theme.accent.primary } as CSSProperties;
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-20 pt-24">
            <div className="pointer-events-auto w-full max-w-[760px]" data-canvas-no-zoom>
                <div className="mb-4 text-center">
                    <h2 className="text-lg font-semibold">从哪里开始？</h2>
                    <p className="mt-1 text-sm" style={{ color: theme.node.muted }}>选择一条主路径，之后仍可随时切换。</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <PathCard
                        icon={<Clapperboard className="size-5" />}
                        title="自己创作"
                        description="搭好短剧骨架，再逐镜头编辑和生成。"
                        action="创建短剧流水线"
                        accent={theme.accent.primary}
                        theme={theme}
                        focusStyle={focusStyle}
                        onClick={onCreatePipeline}
                    />
                    <PathCard
                        icon={<Bot className="size-5" />}
                        title="交给 Agent"
                        description="用一句话描述题材、角色和核心冲突。"
                        action="一句话生成影视项目"
                        accent={theme.node.activeStroke}
                        theme={theme}
                        focusStyle={focusStyle}
                        onClick={onOpenAgent}
                    />
                </div>
                <div className="mt-3 flex justify-center">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "upload", icon: <Upload className="size-4" />, label: "导入素材", onClick: onUpload },
                                { key: "text", icon: <Type className="size-4" />, label: "新建文本", onClick: onAddText },
                                { key: "storyboard", icon: <Clapperboard className="size-4" />, label: "新建空白分镜", onClick: onAddScript },
                            ],
                        }}
                    >
                        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10" style={{ color: theme.node.muted, ...focusStyle }}>
                            <MoreHorizontal className="size-4" />其他起点<ChevronDown className="size-3" />
                        </button>
                    </Dropdown>
                </div>
            </div>
        </div>
    );
}

export function CanvasFreeformEmptyState({ onUpload, onAddText }: { onUpload: () => void; onAddText: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-20 pt-24">
            <div className="pointer-events-auto w-full max-w-[440px] rounded-lg border p-4 shadow-sm backdrop-blur" data-canvas-no-zoom style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                <div className="text-center"><h2 className="text-base font-semibold">从空白画布开始</h2><p className="mt-1 text-xs" style={{ color: theme.node.muted }}>添加文本或导入已有素材。</p></div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={onAddText} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-medium" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><Type className="size-4" />新建文本</button>
                    <button type="button" onClick={onUpload} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border text-sm font-medium" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><Upload className="size-4" />导入素材</button>
                </div>
            </div>
        </div>
    );
}

function PathCard({ icon, title, description, action, accent, theme, focusStyle, onClick }: {
    icon: ReactNode;
    title: string;
    description: string;
    action: string;
    accent: string;
    theme: CanvasTheme;
    focusStyle: CSSProperties;
    onClick: () => void;
}) {
    return (
        <section className="flex min-h-[176px] flex-col rounded-lg border p-4 shadow-sm backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
            <span className="grid size-9 place-items-center rounded-md" style={{ background: `${accent}16`, color: accent }}>{icon}</span>
            <div className="mt-3 text-base font-semibold">{title}</div>
            <p className="mt-1 min-h-10 text-sm leading-5" style={{ color: theme.node.muted }}>{description}</p>
            <button type="button" className="mt-auto inline-flex h-9 w-full items-center justify-between rounded-md border px-3 text-sm font-semibold outline-none transition hover:brightness-105 focus-visible:ring-2" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, ...focusStyle }} onClick={onClick}>
                <span>{action}</span><ArrowRight className="size-4" />
            </button>
        </section>
    );
}
