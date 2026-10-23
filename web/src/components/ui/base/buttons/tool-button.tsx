import type { ComponentPropsWithRef, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * ToolButton — 工具激活态按钮（持久切换，可展开面板）。
 *
 * 用途：工具类按钮——画布工具 Dock、面板工具组：被按下时保持高亮（aria-pressed），
 *   或展开浮层面板（expands → aria-expanded）。active 持久态与 hover/按压态区分
 *   明显，配合画布 ToolDefinition（active/expands/disabled 谓词）渲染。
 * token：active 态 control-selected，常态 bg-transparent +
 *   text-muted-foreground，hover bg-surface-hover；焦点环 control-focus-ring；
 *   danger 态激活文字用 text-status-error。间距由 size 档位控制。
 * 图标契约：`icon` 传 ReactNode（内联 JSX 或组件元素），与画布 tool-registry 的
 *   ToolDefinition.icon 字段一致（icons 是内联 JSX 如 <Undo2 />）；尺寸由本组件
 *   [&_svg] 规则统一控制。禁传 icon className 改尺寸。
 * 对标：接管画布工具 Dock 中按钮渲染（aria-pressed 语义）；AntD Tooltip+Button
 *   组合的工具按钮场景。参考 BoardUI tool 切换语义。
 * 明暗由 token 切换；原生焦点和原地颜色反馈由 unified-buttons.css 负责。
 */
export const toolButtonVariants = cva(
    [
        "inline-flex select-none items-center justify-center gap-1.5 rounded-md px-3",
        "font-medium transition-colors",
        "outline-none",
        "disabled:pointer-events-none disabled:opacity-45",
    ],
    {
        variants: {
            variant: {
                // 工具条/面板内常规（常态透明，激活常驻底）
                ghost: "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                // 常驻浅底（面板内分组工具）
                default: "bg-surface-secondary text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            },
            size: {
                xs: "h-6 px-1.5 text-[length:var(--fs-tiny)] [&_svg]:size-3.5",
                sm: "h-7 px-2 text-[length:var(--fs-caption)] [&_svg]:size-4",
                default: "h-8 px-2.5 text-[length:var(--fs-caption)] [&_svg]:size-4",
                lg: "h-9 px-3 text-[length:var(--fs-body)] [&_svg]:size-[18px]",
            },
            tone: {
                default: "",
                danger: "data-[active=true]:text-status-error",
            },
            active: {
                true: "",
                false: "",
            },
        },
        compoundVariants: [
            {
                variant: ["ghost", "default"],
                active: true,
                className: "bg-surface-active text-foreground hover:text-foreground",
            },
        ],
        defaultVariants: {
            variant: "ghost",
            size: "default",
            tone: "default",
            active: false,
        },
    },
);

export type ToolButtonProps = ComponentPropsWithRef<"button"> &
    VariantProps<typeof toolButtonVariants> & {
        /** 图标内容：ReactNode（内联 JSX，与 tool-registry ToolDefinition.icon 对齐） */
        icon?: ReactNode;
        /** 持久激活态（映射 aria-pressed=true） */
        active?: boolean;
        /** 面板展开型工具：active 走 aria-expanded 语义而非 pressed */
        expands?: boolean;
        loading?: boolean;
        /** 显式文本标签（提供时按带标签布局渲染） */
        label?: ReactNode;
        /** 过滤结果等辅助计数，不参与独立交互。 */
        count?: ReactNode;
    };

export function ToolButton({ variant, size, tone, icon, active, expands = false, loading = false, label, count, children, className, type = "button", disabled, ...props }: ToolButtonProps) {
    return (
        <button
            data-slot="tool-button"
            data-tone={tone ?? "default"}
            type={type}
            disabled={disabled || loading}
            aria-pressed={expands ? undefined : active}
            aria-expanded={expands ? Boolean(active) : undefined}
            aria-busy={loading || undefined}
            data-active={active || undefined}
            className={cn(toolButtonVariants({ variant, size, tone, active }), className)}
            {...props}
        >
            {loading ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : icon}
            {label != null ? <span data-slot="control-label">{label}</span> : children}
            {count != null ? <span data-slot="control-count">{count}</span> : null}
        </button>
    );
}
