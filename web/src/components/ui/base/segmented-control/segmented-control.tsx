import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * SegmentedControl — 分段控制器（自研，无依赖）。
 *
 * 设计约束（对齐 ui/README 与 ADR-0008）：
 * - 只消费三层 token 工具类（surface-tertiary / surface-strong / foreground / muted-foreground / ring …），
 *   不写死任何色值；明暗自适应随主题 token。
 * - 原地中性选中，视觉与标签页 / 过滤共用 app-control-group，不混用交互语义。
 * - 键盘：radio 组 roving tabindex（←/→/Home/End，自动跳过禁用项）。
 * - API 对齐 AntD Segmented（value/onChange/options/block/size/disabled），
 *   可直接置于 antd Form.Item（Form 注入 value/onChange，props 同名兼容）。
 * - icon 节点尺寸由调用方控制（与 AntD options.icon 行为一致），用 currentColor 跟随文字色。
 */

export type SegmentedSize = "sm" | "md";

export interface SegmentedOption<V extends string = string> {
    value: V;
    /** 文本标签（icon-only 时省略） */
    label?: ReactNode;
    /** 图标节点（与 label 同给时渲染在左侧，尺寸自控） */
    icon?: ReactNode;
    disabled?: boolean;
    /** 原生 title */
    title?: string;
}

export interface SegmentedControlProps<V extends string = string> {
    value?: V;
    onChange?: (value: V) => void;
    options: Array<SegmentedOption<V>>;
    size?: SegmentedSize;
    /** 填满父容器宽度（项均分） */
    block?: boolean;
    /** 整体禁用 */
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
    /** @deprecated 保留调用兼容；两种值均使用原地颜色反馈。 */
    indicator?: "slide" | "static";
}

const SIZE_CLASS: Record<SegmentedSize, { track: string; item: string }> = {
    sm: {
        track: "h-7 rounded-md p-0.5",
        item: "rounded-sm px-2.5 text-xs",
    },
    md: {
        track: "h-8 rounded-lg p-0.5",
        item: "rounded-md px-3 text-sm",
    },
};

export function SegmentedControl<V extends string = string>({ value, onChange, options, size = "md", block = false, disabled = false, ariaLabel, className = "" }: SegmentedControlProps<V>) {
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const selectedIndex = options.findIndex((option) => option.value === value);

    /** 无选中项时兜底首个可用项，保证 roving tabindex 下键盘始终可达 */
    const focusableIndex = selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : options.findIndex((option) => !option.disabled);

    const select = (next: V, nextIndex: number) => {
        if (disabled || options[nextIndex]?.disabled) return;
        if (next !== value) onChange?.(next);
        itemRefs.current[nextIndex]?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (disabled || !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Home") {
            const first = options.findIndex((option) => !option.disabled);
            if (first >= 0) select(options[first].value, first);
            return;
        }
        if (event.key === "End") {
            let last = -1;
            options.forEach((option, optionIndex) => {
                if (!option.disabled) last = optionIndex;
            });
            if (last >= 0) select(options[last].value, last);
            return;
        }
        const isPrev = event.key === "ArrowLeft";
        for (let step = 1; step <= options.length; step += 1) {
            const candidate = (index + (isPrev ? -step : step) + options.length * 2) % options.length;
            if (!options[candidate].disabled) {
                select(options[candidate].value, candidate);
                return;
            }
        }
    };

    const itemBase =
        "relative z-10 inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium outline-none transition-colors motion-reduce:transition-none " + "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ";

    return (
        <div data-slot="segmented-control" data-density={size === "sm" ? "compact" : undefined} role="radiogroup" aria-label={ariaLabel} aria-disabled={disabled || undefined} className={["app-control-group relative inline-flex bg-surface-tertiary", SIZE_CLASS[size].track, block ? "flex w-full" : "", disabled ? "opacity-60" : "", className].join(" ")}>
            {options.map((option, index) => {
                const selected = index === selectedIndex;
                return (
                    <button
                        key={option.value}
                        ref={(element) => {
                            itemRefs.current[index] = element;
                        }}
                        type="button"
                        data-slot="control-item"
                        role="radio"
                        aria-checked={selected}
                        aria-label={option.label ? undefined : (option.title ?? option.value)}
                        title={option.title}
                        disabled={disabled || option.disabled}
                        tabIndex={!disabled && index === focusableIndex ? 0 : -1}
                        onClick={() => select(option.value, index)}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        className={[
                            itemBase,
                            SIZE_CLASS[size].item,
                            block ? "flex-1" : "",
                            option.disabled ? "cursor-not-allowed text-muted-foreground/40" : selected ? "cursor-default text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                        ].join(" ")}
                    >
                        {option.icon}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
