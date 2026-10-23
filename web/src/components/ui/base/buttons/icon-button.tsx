import type { ComponentPropsWithRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * IconButton — 纯图标按钮（正方形、尺寸档位、语义变体、loading 态）。
 *
 * 用途：面板/工具条里的图标触发按钮（新建、删除、收起、关闭等）；替代 AntD
 *   Button `type="text"/"ghost" icon` 小尺寸场景与各页私有 icon-button。
 * token：普通表面、button-primary 主命令、control-selected 持久选中、control-focus-ring。
 * 图标契约：`icon` 传 lucide 组件引用，尺寸按 `size` 档位由本组件决定；禁止调用方
 *   传 icon className 改尺寸。必须传 `aria-label`（纯图标无文本）。
 * 对标：dbx ui/button variants（ghost/outline/destructive、icon-xs/sm/lg）；
 *   AntD Button icon-only。
 * 明暗由 token 切换；原生焦点和原地颜色反馈由 unified-buttons.css 负责。
 */
export const iconButtonVariants = cva(
    [
        "inline-flex shrink-0 items-center justify-center rounded-md",
        "outline-none",
        "disabled:pointer-events-none disabled:opacity-45",
    ],
    {
        variants: {
            variant: {
                // 纯透明 + hover 浮底（最常用：面板/工具条）
                ghost: "text-muted-foreground hover:bg-surface-hover hover:text-foreground active:bg-surface-active",
                // 常驻浅底
                default: "bg-surface-secondary text-muted-foreground hover:bg-surface-hover hover:text-foreground active:bg-surface-active",
                // 描边
                outline: "border border-border bg-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                // 危险（文本色常驻红）
                danger: "text-status-error hover:bg-surface-hover active:bg-surface-active",
                // 主命令；持久选中由共享 control-selected token 单独表达。
                solid: "",
            },
            size: {
                xs: "size-6 [&_svg]:size-3.5",
                sm: "size-7 [&_svg]:size-4",
                default: "size-8 [&_svg]:size-4",
                lg: "size-9 [&_svg]:size-[18px]",
            },
        },
        defaultVariants: {
            variant: "ghost",
            size: "default",
        },
    },
);

export type IconButtonProps = ComponentPropsWithRef<"button"> &
    VariantProps<typeof iconButtonVariants> & {
        /** lucide 图标组件引用 */
        icon: LucideIcon;
        /** loading：替换为 spinner 并禁用 */
        loading?: boolean;
        /** 持久选中，自动提供 aria-pressed；未传时为普通命令。 */
        active?: boolean;
    };

export function IconButton({ variant, size, icon: Icon, loading = false, active, className, type = "button", disabled, ...props }: IconButtonProps) {
    return (
        <button
            data-slot="icon-button"
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            aria-pressed={active}
            data-variant={variant ?? "ghost"}
            data-active={active || undefined}
            className={cn(iconButtonVariants({ variant, size }), className)}
            {...props}
        >
            {loading ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Icon aria-hidden />}
        </button>
    );
}
