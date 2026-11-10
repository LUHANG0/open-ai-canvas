// 画布 Agent 输入区：场景胶囊、输入框（附件、@ 引用、/ 技能）、发送/排队/停止按钮与图片预览。
//
// 运行中输入框保持可用（产品约定，勿收紧）：Enter 默认排队，⌘/Ctrl+Enter 插进当前轮；
// 停止由 running 驱动，固定在主按钮左侧，与发送互不排斥。

import type { Skill, SkillPreset } from "@/services/api/skills";
import {
    ArrowLeft,
    ArrowUp,
    AtSign,
    Bookmark,
    Check,
    Clapperboard,
    FileText,
    FolderOpen,
    ImagePlus,
    Layers3,
    ListPlus,
    LoaderCircle,
    Palette,
    Plus,
    Shapes,
    Share2,
    ShoppingBag,
    Sparkles,
    Square,
    SquareDashedMousePointer,
    TriangleAlert,
    X,
    Blocks,
} from "lucide-react";
import { canvasThemes } from "@/lib/canvas-theme";
import { type CSSProperties, type ClipboardEvent as ReactClipboardEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { agentModifierShortcut, agentTextLength, type AgentComposerSubmitMode } from "@/lib/canvas/agent-outbox";
import { AGENT_LONG_TEXT_CHARS } from "@/lib/canvas/agent-composer-attachments";
import { canvasNodeMentionToken } from "@/lib/canvas/canvas-resource-references";
import { CanvasAnchoredDropdown as Dropdown } from "./canvas-anchored-dropdown";
import { buildSkillMentionReferences } from "@/services/skill-runtime";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { WorkingGlow } from "@/components/ai/working-indicator";
import { Tooltip } from "@/components/ui/base/tooltip";
import { Button, Popover } from "antd";
import { usePopoverAnchorAlign } from "@/hooks/use-popover-anchor-align";
import { agentAttachmentReferences, type CloudAgentChatAttachment } from "./canvas-cloud-agent-attachments";

export const MIN_AGENT_PROMPT_HEIGHT = 60;

export const MAX_AGENT_PROMPT_HEIGHT = 240;

export function clampAgentPromptHeight(height: number) {
    return Math.min(MAX_AGENT_PROMPT_HEIGHT, Math.max(MIN_AGENT_PROMPT_HEIGHT, Math.ceil(height)));
}

export function appendAgentSkillSelection(current: string[], incoming: string[]) {
    return [...new Set([...current, ...incoming])];
}

/**
 * 本次技能统一入口：查看/移除本次已选，或按分类浏览推荐组合，并可进入原技能库。
 * 两组来源，都不限剧典技能：
 *  1) 配方组——只读消费 GET /skills/presets（随二进制内置的手工策展配方）
 *  2) 常用组——用户已装（其中可含已收藏）及自建的技能，按常用度排序（含官方种子库与自定义）
 * 选择只作用于本会话；缺失的技能会持久安装到当前用户的技能库。
 * 挂上之后具体用哪张卡由 Agent 在任务里检索判断，分类浏览本身不会绑定技能。
 */
export type AgentSceneBucket = {
    key: string;
    label: string;
    presets: SkillPreset[];
    skills: Skill[];
};

/** 场景分类：与 presets.json 的 scene 字段、技能的 tag 字段共用同一套 key。 */
export const AGENT_SCENE_DEFS: Array<{ key: string; label: string; icon: typeof Blocks }> = [
    { key: "frequent", label: "我的常用", icon: Bookmark },
    { key: "drama", label: "短剧故事", icon: Clapperboard },
    { key: "ecommerce", label: "广告电商", icon: ShoppingBag },
    { key: "creative", label: "视觉创意", icon: Palette },
    { key: "social", label: "传播社媒", icon: Share2 },
    { key: "others", label: "其他", icon: Shapes },
];

export function AgentSceneCapsules({
    buckets,
    installedIds,
    theme,
    disabled = false,
    onPick,
    onPickSkill,
    selectedSkillIds,
    selectedSkills,
    open,
    onOpenChange,
    onRemove,
    onClear,
    onOpenLibrary,
}: {
    buckets: AgentSceneBucket[];
    installedIds: Set<string>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    disabled?: boolean;
    selectedSkillIds: string[];
    selectedSkills: Skill[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRemove: (id: string) => void;
    onClear: () => void;
    onOpenLibrary: () => void;
    onPick: (preset: SkillPreset) => Promise<number | false>;
    onPickSkill: (skill: Skill) => Promise<number | false>;
}) {
    const setOpen = onOpenChange;
    const [applying, setApplying] = useState(false);
    const applyingRef = useRef(false);
    const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
    const apply = async (action: () => Promise<number | false>) => {
        if (disabled || applyingRef.current) return;
        applyingRef.current = true;
        setApplying(true);
        setFeedback(null);
        try {
            const added = await action();
            setFeedback(added === false
                ? { error: true, text: "当前暂不能更改技能，请等待运行或会话加载完成后重试。" }
                : { error: false, text: added > 0 ? `已加入 ${added} 项技能` : "这些技能已在本次选择中" });
        } catch (cause) {
            setFeedback({ error: true, text: `${cause instanceof Error ? cause.message : String(cause)}；已安装的技能仍保留在技能库，可重试。` });
        } finally {
            applyingRef.current = false;
            setApplying(false);
        }
    };
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const popoverRef = usePopoverAnchorAlign(open);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const pickerId = useId();
    const disclosureId = useId();
    const titleId = useId();
    const disclosure = "选择待装技能时，缺失技能会持久加入你的技能库，不随会话结束移除。";
    const visible = buckets.filter((bucket) => bucket.presets.length + bucket.skills.length > 0);
    const active = visible.find((bucket) => bucket.key === activeKey) || visible.find((bucket) => bucket.key === "frequent") || visible[0];
    const hasMissing = Boolean(active?.presets.some((preset) => preset.skillIds.some((id) => !installedIds.has(id))) || active?.skills.some((skill) => !installedIds.has(skill.skillId)));
    const close = () => {
        setOpen(false);
        triggerRef.current?.focus();
    };
    const stop = {
        onMouseDown: (event: { stopPropagation(): void }) => event.stopPropagation(),
        onPointerDown: (event: { stopPropagation(): void }) => event.stopPropagation(),
        onClick: (event: { stopPropagation(): void }) => event.stopPropagation(),
    };
    return (
        <div className="agent-scene-capsules min-w-0 shrink-0" style={{ color: theme.node.text }} {...stop}>
            <Popover
                ref={popoverRef}
                open={open}
                onOpenChange={setOpen}
                afterOpenChange={(shown) => { if (shown) closeRef.current?.focus(); }}
                trigger="click"
                placement="topLeft"
                arrow={false}
                autoAdjustOverflow
                classNames={{ root: "agent-skill-picker-popover" }}
                getPopupContainer={() => document.body}
                styles={{ root: { "--agent-surface-base": theme.node.panel, "--agent-ink": theme.node.text, "--agent-accent": theme.accent.primary, "--agent-shadow-color": theme.spatial.shadow } as CSSProperties }}
                content={
                    <section
                        id={pickerId}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={hasMissing ? disclosureId : undefined}
                        className="agent-skill-picker"
                        data-canvas-no-zoom
                        {...stop}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Escape") {
                                event.preventDefault();
                                close();
                            } else if (event.key === "Tab") {
                                const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
                                const first = controls[0];
                                const last = controls[controls.length - 1];
                                if (event.shiftKey && document.activeElement === first) {
                                    event.preventDefault();
                                    last?.focus();
                                } else if (!event.shiftKey && document.activeElement === last) {
                                    event.preventDefault();
                                    first?.focus();
                                }
                            }
                        }}
                    >
                        <header className="agent-skill-picker-head">
                            <div>
                                <h3 id={titleId}>创作技能</h3>
                                <p>选好后发送消息，助手会按需要使用</p>
                            </div>
                            <button ref={closeRef} type="button" className="agent-skill-picker-close" aria-label="关闭技能选择" onClick={close}><X aria-hidden="true" /></button>
                        </header>
                        <div className="agent-skill-picker-selected thin-scrollbar" aria-label="本次已选技能" data-canvas-wheel-scroll>
                            {selectedSkillIds.length ? <>
                                <div className="agent-skill-picker-selection-head"><span>已选 {selectedSkillIds.length} 项</span><button type="button" disabled={disabled || applying} onClick={() => { onClear(); setFeedback(null); }}>清空选择</button></div>
                                <div className="agent-skill-picker-chips">{selectedSkillIds.map((id) => {
                                    const name = selectedSkills.find((item) => item.skillId === id)?.skillName || id;
                                    return <button key={id} type="button" disabled={disabled || applying} aria-label={`移除${name}`} title={name} onClick={() => { onRemove(id); setFeedback(null); }}><span>{name}</span><X aria-hidden="true" /></button>;
                                })}</div>
                            </> : <p>还未选择技能，可以直接发送，也可以按需添加</p>}
                        </div>
                        {feedback ? <p className="agent-skill-picker-feedback" role={feedback.error ? "alert" : "status"}>{feedback.text}</p> : null}
                        {applying ? <p className="agent-skill-picker-feedback" role="status">正在确认安装并更新本次已选…</p> : null}
                        <nav className="agent-skill-picker-categories thin-scrollbar" aria-label="技能分类" data-canvas-wheel-scroll>
                            {visible.map((bucket) => {
                                const Icon = AGENT_SCENE_DEFS.find((scene) => scene.key === bucket.key)?.icon || Shapes;
                                return (
                                    <button key={bucket.key} type="button" disabled={applying} aria-pressed={active?.key === bucket.key} onClick={() => setActiveKey(bucket.key)}>
                                        <Icon aria-hidden="true" />
                                        <span>{bucket.label}</span>
                                        <small>{bucket.presets.length + bucket.skills.length}</small>
                                    </button>
                                );
                            })}
                        </nav>
                        <div key={active?.key} className="agent-skill-picker-list thin-scrollbar" aria-label={`${active?.label || "推荐"}技能`} data-canvas-wheel-scroll aria-busy={applying}>
                            {!active ? <p>暂无推荐组合，可从技能库浏览更多技能。</p> : null}
                            {active?.presets.map((preset) => {
                                const missing = preset.skillIds.filter((id) => !installedIds.has(id)).length;
                                const selected = preset.skillIds.every((id) => selectedSkillIds.includes(id));
                                return (
                                    <div className="agent-skill-picker-row" key={preset.presetId}>
                                        <div className="agent-skill-picker-copy">
                                            <strong>{preset.name}</strong>
                                            <p title={preset.rationale}>{preset.rationale}</p>
                                            <small>{preset.skillIds.length} 项技能{missing > 0 ? ` · ${missing} 待装` : ""}</small>
                                        </div>
                                        <button type="button" disabled={disabled || applying || selected} aria-label={`选用组合：${preset.name}`} aria-describedby={missing ? disclosureId : undefined} onClick={() => void apply(() => onPick(preset))}>{selected ? "已选用" : "选用"}</button>
                                    </div>
                                );
                            })}
                            {active?.skills.map((skill) => {
                                const missing = !installedIds.has(skill.skillId);
                                const status = missing ? "待装" : skill.isOwner ? "自建" : skill.isLike ? "已收藏" : "已装";
                                return (
                                    <div className="agent-skill-picker-row" key={skill.skillId}>
                                        <div className="agent-skill-picker-copy">
                                            <strong>{skill.skillName}</strong>
                                            <p title={skill.description}>{skill.description}</p>
                                            <small>1 技能 · {status}{missing ? "，将持久加入技能库" : ""}</small>
                                        </div>
                                        <button type="button" disabled={disabled || applying || selectedSkillIds.includes(skill.skillId)} aria-label={`加入本次：${skill.skillName}`} aria-describedby={missing ? disclosureId : undefined} onClick={() => void apply(() => onPickSkill(skill))}>{selectedSkillIds.includes(skill.skillId) ? "已加入" : "加入"}</button>
                                    </div>
                                );
                            })}
                        </div>
                        {hasMissing ? <p id={disclosureId} className="agent-skill-picker-disclosure">{disclosure}</p> : null}
                        <footer className="agent-skill-picker-footer"><button type="button" onClick={() => { close(); onOpenLibrary(); }}>更多技能，打开技能库</button></footer>
                    </section>
                }
            >
                <button
                    ref={triggerRef}
                    type="button"
                    aria-label={selectedSkillIds.length ? `创作技能 · 已选 ${selectedSkillIds.length}` : "创作技能"}
                    className="agent-skill-picker-trigger"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={open ? pickerId : undefined}
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") close(); }}
                >
                    <Sparkles aria-hidden="true" />创作技能{selectedSkillIds.length ? ` · 已选 ${selectedSkillIds.length}` : ""}
                </button>
            </Popover>
        </div>
    );
}

/** 输入卡片顶部上下文行里的一项：图标、一句说明和行内操作（选区、看图提示、长文本转换共用）。 */
export function AgentContextChip({ icon, tone = "default", title, children, actions }: { icon: ReactNode; tone?: "default" | "off" | "warning"; title?: string; children: ReactNode; actions?: ReactNode }) {
    return (
        <span className={`agent-context-chip${tone === "off" ? " is-off" : tone === "warning" ? " is-warning" : ""}`} title={title} role={tone === "warning" ? "status" : undefined}>
            {icon}
            <span className="truncate">{children}</span>
            {actions}
        </span>
    );
}

export function AgentChatComposer({
    prompt,
    attachments = [],
    disabled,
    sending,
    submitDisabled,
    submitMode = "send",
    running,
    placeholder,
    theme,
    onPromptChange,
    onSubmit,
    onEscape,
    primaryDisabled,
    onAddFiles,
    onRemoveAttachment,
    onRetryAttachment,
    addMenu,
    contextBar,
    charLimit,
    blockReason,
    onLongTextPaste,
    left,
    submitAccessory,
    tray,
    footer,
    trayStatus,
    onStop,
    stopping,
    references = [],
    slashSkills,
    includeAssetLibrary,
}: {
    prompt: string;
    attachments?: CloudAgentChatAttachment[];
    disabled?: boolean;
    /** 新一轮请求在路上：只拦住「发送」，排队和保存不受影响。 */
    sending?: boolean;
    submitDisabled?: boolean;
    /** 主按钮与 Enter 的意图：发送新一轮、加入队列，或保存正在编辑的排队消息。 */
    submitMode?: AgentComposerSubmitMode;
    running?: boolean;
    placeholder: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPromptChange: (value: string) => void;
    /** alternate：按了 ⌘/Ctrl+Enter（运行中表示直接插话）。 */
    onSubmit: (options: { alternate: boolean }) => void;
    /** 输入框里按 Esc（没有弹出菜单时）：取消编辑、连按两次停止本轮。 */
    onEscape?: () => void;
    /** 只禁用主按钮和普通 Enter（例如队列已满）；⌘/Ctrl+Enter 仍交给 onSubmit，由调用方决定能否插话。 */
    primaryDisabled?: boolean;
    /** 输入卡片上方、同一张外壳里的内容（排队消息条）。 */
    tray?: ReactNode;
    onStop?: () => void | Promise<void>;
    stopping?: boolean;
    onAddFiles?: (files: FileList | File[] | null) => void | Promise<void>;
    onRemoveAttachment?: (id: string) => void;
    /** 上传失败、只存在本机或已从画布删除的附件，用原文件重新上传。 */
    onRetryAttachment?: (id: string) => void;
    /** 最左侧「+」菜单的其他入口；disabledReason 有值时菜单只显示原因（例如不在画布里）。 */
    addMenu?: { disabledReason?: string | null; onPickAssets?: () => void; selectionCount?: number; onReferenceSelection?: () => void };
    /** 输入卡片顶部的一行上下文：选区、看图提示、长文本转换。 */
    contextBar?: ReactNode;
    /** 超过上限的 80% 时显示字数；超出后不能发送。 */
    charLimit?: number;
    /** 暂时不能发送的原因（例如图片还在上传）；有值时主按钮和 Enter 都不可用。 */
    blockReason?: string | null;
    /** 粘贴了很长的文字：文字照常粘贴，由调用方决定是否建议转成画布文本节点。 */
    onLongTextPaste?: (text: string) => void;
    left?: ReactNode;
    /** 发送按钮左侧的附属控件，例如上下文用量环。 */
    submitAccessory?: ReactNode;
    /** 输入区底部的附加内容（例如连接器条）。 */
    footer?: ReactNode;
    /** 底托盘右侧状态与配置；启用助手分层布局，不改变其他调用方。 */
    trayStatus?: ReactNode;
    /** 供「@」插入的画布节点/素材/技能引用候选（可选，默认空，缺省时退化为普通输入框） */
    references?: CanvasResourceReference[];
    /** 供「/」弹出的技能候选（可选） */
    slashSkills?: Skill[];
    /** 是否在「@」候选里包含素材库资源 */
    includeAssetLibrary?: boolean;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [slash, setSlash] = useState<{ start: number; query: string } | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [previewAttachment, setPreviewAttachment] = useState<CloudAgentChatAttachment | null>(null);
    const [promptHeight, setPromptHeight] = useState(MIN_AGENT_PROMPT_HEIGHT);
    const promptResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
    const manualPromptHeightRef = useRef<number | null>(null);
    const availableSlashSkills = slashSkills ?? [];
    const slashCandidates = useMemo(() => {
        const query = slash?.query.trim().toLocaleLowerCase() || "";
        if (!query) return availableSlashSkills;
        return availableSlashSkills.filter((skill) => `${skill.skillName} ${skill.description || ""}`.toLocaleLowerCase().includes(query));
    }, [availableSlashSkills, slash?.query]);
    const attachmentReferences = useMemo(() => agentAttachmentReferences(attachments), [attachments]);
    const skillReferences = useMemo(() => buildSkillMentionReferences(availableSlashSkills), [availableSlashSkills]);
    // 保留每个 id 第一次出现的引用；用 Set 去重，节点多时不再是平方级。
    const composerReferences = useMemo(() => {
        const seen = new Set<string>();
        return [...references, ...skillReferences, ...attachmentReferences].filter((reference) => {
            if (seen.has(reference.id)) return false;
            seen.add(reference.id);
            return true;
        });
    }, [attachmentReferences, references, skillReferences]);
    const canStop = Boolean(running && onStop);
    const textLength = agentTextLength(prompt);
    const overLimit = Boolean(charLimit && textLength > charLimit);
    const showCount = Boolean(charLimit && textLength > charLimit * 0.8);
    const blockedReason = overLimit ? `超过 ${charLimit!.toLocaleString()} 字，请删减${onLongTextPaste ? "，或把长文本转成画布文本节点" : ""}` : blockReason || null;
    // 请求在路上只拦「发送」：排队与保存不发请求，运行中照样可用。
    const canSubmit = !disabled && !submitDisabled && !blockedReason && !(sending && submitMode === "send") && Boolean(prompt.trim() || attachments.length);
    const canPrimary = canSubmit && !primaryDisabled;
    const modifierEnter = agentModifierShortcut("Enter");
    const wrapped = Boolean(footer || tray || trayStatus);
    const reducedMotion = useReducedMotion();
    const submitState = submitMode === "send" && sending ? "sending" : submitMode;
    const submitLabel = submitMode === "save" ? "保存" : submitMode === "queue" ? "排队" : sending ? "发送中" : "发送";
    const submitTitle =
        blockedReason ||
        (submitMode === "save"
            ? "保存修改 · Enter（Esc 取消）"
            : submitMode === "queue"
              ? primaryDisabled
                  ? `排队已满，先移出一条；${modifierEnter} 仍可直接插话`
                  : `排队：本轮结束后依次发送 · Enter；${modifierEnter} 直接插话`
              : "发送：Enter 或 ⌘/Ctrl+Enter 发送，Shift+Enter 换行");
    const activeSlashIndex = Math.min(Math.max(slashIndex, 0), Math.max(slashCandidates.length - 1, 0));

    const handlePromptContentSizeChange = useCallback((naturalHeight: number) => {
        const nextHeight = clampAgentPromptHeight(naturalHeight);
        // 用户开始拖动后，面板高度由用户掌控；超出部分交给内部滚动区，
        // 避免输入新内容时又把手动缩小的面板强行撑开。
        setPromptHeight((currentHeight) => (manualPromptHeightRef.current === null ? nextHeight : currentHeight));
    }, []);

    useEffect(() => {
        if (prompt.trim()) return;
        manualPromptHeightRef.current = null;
        setPromptHeight(MIN_AGENT_PROMPT_HEIGHT);
    }, [prompt]);

    const startPromptResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (disabled) return;
        event.preventDefault();
        manualPromptHeightRef.current = promptHeight;
        promptResizeRef.current = { startY: event.clientY, startHeight: promptHeight };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const resizePrompt = (event: ReactPointerEvent<HTMLButtonElement>) => {
        const resize = promptResizeRef.current;
        if (!resize) return;
        setPromptHeight(clampAgentPromptHeight(resize.startHeight + resize.startY - event.clientY));
    };

    const finishPromptResize = (event?: ReactPointerEvent<HTMLButtonElement>) => {
        promptResizeRef.current = null;
        if (event?.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    const resizePromptByKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        manualPromptHeightRef.current = promptHeight;
        setPromptHeight(clampAgentPromptHeight(promptHeight + (event.key === "ArrowUp" ? 20 : -20)));
    };

    // 在输入值末尾检测「/ 或 、+ 关键词」打开技能候选：中文输入法下 "/" 会打成 "、"，两者等价，且都必须紧跟行首或空白，避免中文顿号误触发。选中后写入稳定 token，编辑器再把它渲染为技能 chip。
    const handlePromptChange = (value: string) => {
        onPromptChange(value);
        const match = /(^|\s)[/、]([^\s/、]*)$/.exec(value);
        if (match && availableSlashSkills.length) {
            const next = { start: match.index + match[1].length, query: match[2] };
            setSlash((current) => (current && current.start === next.start && current.query === next.query ? current : next));
            setSlashIndex(0);
        } else if (slash) {
            setSlash(null);
        }
    };

    const applySlashSkill = (skill: Skill) => {
        const token = `@[skill:${skill.skillId}] `;
        // 触发符 "/" 与 "、" 都是单字符，替换长度固定为 1。
        const next = slash ? `${prompt.slice(0, slash.start)}${token}${prompt.slice(slash.start + 1 + slash.query.length)}` : prompt ? `${prompt.replace(/\s+$/u, "")} ${token}` : token;
        setSlash(null);
        setSlashIndex(0);
        onPromptChange(next);
    };

    // slash 菜单的键盘控制在 capture 阶段拦截（contentEditable/textarea 内部先消费 Enter，外层冒泡拿不到）
    const handleSlashKeyCapture = (event: ReactKeyboardEvent) => {
        if (!slash || !slashCandidates.length) return;
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            setSlashIndex((index) => Math.min(index + 1, slashCandidates.length - 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            setSlashIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            applySlashSkill(slashCandidates[activeSlashIndex]);
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setSlash(null);
        }
    };

    // 粘贴图片成附件（contentEditable 模式内部会把粘贴转纯文本，capture 阶段先取图片）。
    // 部分浏览器从网页复制图片只给 items，不给 files，两处都读，重复的由调用方去重。
    const handlePasteCapture = (event: ReactClipboardEvent) => {
        const data = event.clipboardData;
        const itemFiles = Array.from(data.items || [])
            .filter((entry) => entry.kind === "file")
            .map((entry) => entry.getAsFile())
            .filter((file): file is File => Boolean(file));
        const images = [...Array.from(data.files), ...itemFiles].filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/iu.test(file.name));
        const text = data.getData("text/plain");
        // 从访达复制文件时 text/plain 是文件名，不当成要粘贴的文字。
        const pastedText = images.some((file) => file.name === text.trim()) ? "" : text;
        if (images.length && onAddFiles) {
            // 只有图片时拦下粘贴；同时有文字时文字照常粘贴进输入框。
            if (!pastedText.trim()) {
                event.preventDefault();
                event.stopPropagation();
            }
            void onAddFiles(images);
        }
        if (pastedText && onLongTextPaste && agentTextLength(pastedText) > AGENT_LONG_TEXT_CHARS) onLongTextPaste(pastedText);
    };

    const insertAttachmentMention = (item: CloudAgentChatAttachment) => {
        const mention = item.nodeId ? canvasNodeMentionToken(item.nodeId) : `@[attachment:${item.id}]`;
        if (prompt.includes(mention)) return;
        onPromptChange(prompt ? `${prompt.replace(/\s+$/u, "")} ${mention} ` : `${mention} `);
    };
    const addItems = addMenu?.disabledReason
        ? [{ key: "reason", disabled: true, label: addMenu.disabledReason }]
        : [
              { key: "upload", icon: <ImagePlus className="size-3.5" />, label: "上传图片", onClick: () => fileInputRef.current?.click() },
              ...(addMenu?.onPickAssets ? [{ key: "assets", icon: <FolderOpen className="size-3.5" />, label: "从素材库选择", onClick: addMenu.onPickAssets }] : []),
              ...(addMenu?.onReferenceSelection && addMenu.selectionCount ? [{ key: "selection", icon: <SquareDashedMousePointer className="size-3.5" />, label: `引用选中的 ${addMenu.selectionCount} 个节点`, onClick: addMenu.onReferenceSelection }] : []),
          ];

    return (
        <div className="agent-composer-wrap min-w-0 shrink-0" onWheelCapture={(event) => event.stopPropagation()}>
            {/* 有队列条或底部附加内容时，外壳托住它们与输入卡片，形成一张整卡。 */}
            <div className="agent-composer-shell relative" data-has-footer={wrapped ? "" : undefined} data-layered={trayStatus ? "" : undefined}>
                {sending && !reducedMotion ? <WorkingGlow active color={theme.accent.primary} radius={22} /> : null}
                <AnimatePresence initial={false}>
                    {tray ? (
                        <motion.div
                            key="outbox"
                            className="agent-composer-tray"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
                        >
                            {tray}
                        </motion.div>
                    ) : null}
                </AnimatePresence>
                <div
                    className="agent-composer-surface relative transition-colors duration-200"
                    style={{
                        color: theme.accent.primary,
                    }}
                >
                    {/* 调高把手固定在卡片最上沿；上下文行和附件在它下面，不会把把手挤到卡片中间。 */}
                    <button
                        type="button"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="调整提示词面板高度"
                        aria-valuemin={MIN_AGENT_PROMPT_HEIGHT}
                        aria-valuemax={MAX_AGENT_PROMPT_HEIGHT}
                        aria-valuenow={promptHeight}
                        className="agent-composer-resize-handle"
                        style={{ color: theme.node.muted }}
                        onPointerDown={startPromptResize}
                        onPointerMove={resizePrompt}
                        onPointerUp={finishPromptResize}
                        onPointerCancel={finishPromptResize}
                        onKeyDown={resizePromptByKeyboard}
                    >
                        <span />
                    </button>
                    {contextBar ? <div className="agent-composer-context">{contextBar}</div> : null}
                    {attachments.length ? (
                        <div className="agent-attachments thin-scrollbar" role="list" aria-label={`附件 ${attachments.length} 个`}>
                            {attachments.map((item, index) => {
                                const status = item.status ?? "ready";
                                const busy = status === "uploading" || status === "pending";
                                const failed = status === "error" || status === "local_only" || status === "missing";
                                const name = item.nodeId ? item.name || (item.kind === "text" ? "文本" : `图片${index + 1}`) : `图片${index + 1}`;
                                // 卡片上只放名字主体；扩展名和完整名字在悬停提示里。
                                const label = name.replace(/\.(png|jpe?g|webp|gif|heic|heif)$/iu, "") || name;
                                const statusText =
                                    status === "uploading"
                                        ? item.progress !== undefined
                                            ? `${item.progress}%`
                                            : "上传中"
                                        : status === "pending"
                                          ? "准备中"
                                          : status === "error"
                                            ? item.error || "上传失败"
                                            : status === "local_only"
                                              ? "只存在本机，Agent 看不到"
                                              : status === "missing"
                                                ? "已从画布删除"
                                                : "";
                                return (
                                    <div key={item.id} role="listitem" className={`agent-attachment${failed ? " is-failed" : ""}`} aria-label={failed || busy ? `${name}：${statusText}` : name}>
                                        <button type="button" className="agent-attachment-thumb" title={item.url ? `${name} · 点击放大预览` : name} aria-label={`预览 ${name}`} onClick={() => (item.url ? setPreviewAttachment(item) : undefined)}>
                                            {item.url ? (
                                                <img src={item.url} alt="" className="size-full object-cover" />
                                            ) : (
                                                <span className="grid size-full place-items-center">
                                                    <FileText className="size-6 opacity-60" aria-hidden="true" />
                                                </span>
                                            )}
                                            {busy || failed ? (
                                                <span className={`agent-attachment-veil${failed ? " is-failed" : ""}`} aria-hidden="true">
                                                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <TriangleAlert className="size-4" />}
                                                    {busy ? <span>{statusText}</span> : null}
                                                </span>
                                            ) : null}
                                        </button>
                                        {onRemoveAttachment ? (
                                            // 移除叠在缩略图右上角：悬停或键盘聚焦时出现，触屏和失败时常显。
                                            <button
                                                type="button"
                                                className="agent-attachment-remove"
                                                onClick={() => onRemoveAttachment(item.id)}
                                                aria-label={`移除 ${name}`}
                                                title={item.nodeId ? "移除：这次放到画布、还没连线的节点会一起删除（可撤销）" : "移除"}
                                            >
                                                <X className="size-3" aria-hidden="true" />
                                            </button>
                                        ) : null}
                                        <button type="button" className="agent-attachment-label" title={`在输入框里插入 @${name}`} onClick={() => insertAttachmentMention(item)}>
                                            <AtSign className="size-2.5 shrink-0" aria-hidden="true" />
                                            <span className="truncate">{label}</span>
                                        </button>
                                        {failed ? (
                                            <div className="agent-attachment-error" role="status" title={statusText}>
                                                <span>{statusText}</span>
                                                {item.retryable && onRetryAttachment ? (
                                                    <button type="button" className="agent-attachment-retry" onClick={() => onRetryAttachment(item.id)}>
                                                        重试
                                                    </button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                    <div className="relative" onKeyDownCapture={handleSlashKeyCapture} onPasteCapture={handlePasteCapture}>
                        <div className="agent-composer-prompt-scroll" style={{ height: promptHeight }}>
                            <CanvasResourceMentionTextarea
                                value={prompt}
                                references={composerReferences}
                                includeAssetLibrary={includeAssetLibrary}
                                sendOnEnter={canSubmit ? "both" : false}
                                disabled={disabled}
                                onChange={handlePromptChange}
                                onSubmit={(event) => {
                                    if (canSubmit) onSubmit({ alternate: Boolean(event?.modifier) });
                                }}
                                onKeyDown={(event) => {
                                    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || !onEscape) return;
                                    event.preventDefault();
                                    onEscape();
                                }}
                                onContentSizeChange={handlePromptContentSizeChange}
                                className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 outline-none placeholder:opacity-45"
                                containerClassName="min-h-[60px] h-full"
                                style={{ color: theme.node.text }}
                                placeholder={placeholder}
                                aria-label="Agent 输入"
                            />
                        </div>
                        {slash && slashCandidates.length ? (
                            <div
                                data-agent-slash-menu
                                className="absolute bottom-full left-0 z-[var(--z-toolbar)] mb-2 w-full max-w-xs overflow-hidden rounded-2xl p-2 shadow-2xl"
                                style={{ background: theme.toolbar.panel, boxShadow: `0 18px 44px ${theme.spatial.shadow}` }}
                                onMouseDown={(event) => event.preventDefault()}
                            >
                                {slashCandidates.map((skill, index) => (
                                    <button
                                        key={skill.skillId}
                                        type="button"
                                        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs"
                                        style={{ background: index === activeSlashIndex ? theme.toolbar.itemHover : "transparent", color: theme.node.text }}
                                        onMouseEnter={() => setSlashIndex(index)}
                                        onClick={() => applySlashSkill(skill)}
                                    >
                                        <Blocks className="size-3.5 shrink-0 opacity-70" />
                                        <span className="min-w-0 truncate font-medium">{skill.skillName}</span>
                                        {skill.description ? <span className="min-w-0 flex-1 truncate opacity-50">{skill.description}</span> : null}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="agent-composer-toolbar mt-2">
                        <div className="agent-composer-controls flex min-w-0 items-center gap-1">
                            {onAddFiles ? (
                                <>
                                    <input
                                        ref={fileInputRef}
                                        hidden
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/gif"
                                        multiple
                                        onChange={(event) => {
                                            void onAddFiles(event.target.files);
                                            event.target.value = "";
                                        }}
                                    />
                                    {/* 「+」固定在最左：上传图片、从素材库选择、引用选中节点。 */}
                                    <Dropdown trigger={["click"]} placement="topLeft" menu={{ items: addItems }}>
                                        <button type="button" className="agent-composer-add" disabled={disabled} aria-label="添加图片、素材或引用" title={addMenu?.disabledReason || "添加：上传图片、从素材库选择、引用选中节点（也可以直接粘贴或拖入图片）"}>
                                            <Plus className="size-4" aria-hidden="true" />
                                        </button>
                                    </Dropdown>
                                </>
                            ) : null}
                            {left}
                        </div>
                        <div className="agent-composer-submit flex items-center gap-2">
                            {showCount ? (
                                <span className={`agent-composer-count${overLimit ? " is-over" : ""}`} title={overLimit ? (blockedReason ?? undefined) : `单条消息最多 ${charLimit!.toLocaleString()} 字`}>
                                    {textLength.toLocaleString()} / {charLimit!.toLocaleString()}
                                </span>
                            ) : null}
                            {submitAccessory}
                            <span className="agent-composer-stop-slot">
                                <AnimatePresence initial={false}>
                                    {canStop ? (
                                        <motion.button
                                            key="stop"
                                            type="button"
                                            disabled={stopping}
                                            aria-label="停止本轮"
                                            title={stopping ? "正在停止本轮" : "停止本轮（输入框里连按两次 Esc 也可以）：Agent 不再继续操作；已提交的生成任务会继续完成"}
                                            onClick={() => void onStop?.()}
                                            data-icon-only
                                            className="agent-composer-stop grid size-7 shrink-0 place-items-center rounded-full p-0 disabled:cursor-not-allowed"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: reducedMotion ? 0 : 0.15 }}
                                        >
                                            {stopping ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Square className="size-3" fill="currentColor" aria-hidden="true" />}
                                        </motion.button>
                                    ) : null}
                                </AnimatePresence>
                            </span>
                            <button
                                type="button"
                                disabled={!canPrimary}
                                aria-label={submitMode === "save" ? "保存修改" : submitLabel}
                                aria-busy={submitState === "sending"}
                                title={submitTitle}
                                onClick={() => onSubmit({ alternate: false })}
                                className="agent-composer-send inline-grid h-7 shrink-0 place-items-center rounded-full p-0 text-[var(--fs-label)] font-medium outline-none transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-current/35 disabled:cursor-not-allowed"
                                style={{
                                    background: canPrimary || submitState === "sending" ? theme.accent.primary : theme.spatial.surface,
                                    color: canPrimary || submitState === "sending" ? theme.accent.onPrimary : theme.node.muted,
                                }}
                            >
                                <AnimatePresence initial={false} mode="sync">
                                    <motion.span key={submitState} className="agent-composer-send-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }} aria-hidden="true">
                                        {submitState === "sending" ? (
                                            <LoaderCircle className="size-3.5 animate-spin" />
                                        ) : submitMode === "save" ? (
                                            <Check className="size-3.5" />
                                        ) : submitMode === "queue" ? (
                                            <ListPlus className="size-3.5" />
                                        ) : (
                                            <ArrowUp className="size-3.5" />
                                        )}
                                        <span>{submitMode === "save" ? "保存" : submitMode === "queue" ? "排队" : "发送"}</span>
                                    </motion.span>
                                </AnimatePresence>
                            </button>
                        </div>
                    </div>
                </div>
                {trayStatus ? (
                    <div className="agent-composer-tray">
                        <div className="agent-composer-tray-status">{trayStatus}</div>
                        {footer ? <div className="agent-composer-tray-connectors">{footer}</div> : null}
                    </div>
                ) : footer}
            </div>
            {previewAttachment ? <AgentImagePreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} /> : null}
        </div>
    );
}

export function AgentImagePreview({ attachment, onClose }: { attachment: CloudAgentChatAttachment; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[var(--z-dialog-popover)] grid place-items-center bg-black/80 p-6" role="dialog" aria-label={attachment.name} onClick={onClose}>
            <img src={attachment.url} alt={attachment.name} className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} />
            <button type="button" className="absolute right-5 top-5 rounded-full bg-black/60 p-2 text-white" onClick={onClose} aria-label="关闭图片预览">
                <X className="size-5" />
            </button>
        </div>
    );
}
