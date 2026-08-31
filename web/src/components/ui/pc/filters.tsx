import { Search, X } from "lucide-react";
import type { HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./pc-ui.css";

export type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    containerClassName?: string;
    onClear?: () => void;
};

export function SearchField({ containerClassName, className, onClear, value, disabled, "aria-label": ariaLabel = "搜索", ...props }: SearchFieldProps) {
    const showClear = Boolean(onClear && value !== undefined && String(value).length > 0);

    return (
        <div className={cn("pc-search-field", onClear && "pc-search-field--custom-clear", disabled && "is-disabled", containerClassName)}>
            <Search className="pc-search-field__icon" aria-hidden="true" />
            <input {...props} type="search" value={value} disabled={disabled} aria-label={ariaLabel} className={cn("pc-search-field__input", className)} />
            {showClear ? (
                <button type="button" className="pc-search-field__clear" aria-label="清空搜索" disabled={disabled} onClick={onClear}>
                    <X aria-hidden="true" />
                </button>
            ) : null}
        </div>
    );
}

export type FilterBarProps = HTMLAttributes<HTMLDivElement> & {
    leading?: ReactNode;
    trailing?: ReactNode;
    activeFilters?: ReactNode;
};

export function FilterBar({ leading, trailing, activeFilters, className, children, ...props }: FilterBarProps) {
    return (
        <div className={cn("pc-filter-bar", className)} {...props}>
            <div className="pc-filter-bar__main">
                {leading ? <div className="pc-filter-bar__leading">{leading}</div> : null}
                <div className="pc-filter-bar__controls">{children}</div>
                {activeFilters ? <div className="pc-filter-bar__active">{activeFilters}</div> : null}
            </div>
            {trailing ? <div className="pc-filter-bar__trailing">{trailing}</div> : null}
        </div>
    );
}

export type FilterChipProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
    label: ReactNode;
    value?: ReactNode;
    onRemove?: () => void;
    removeLabel?: string;
};

export function FilterChip({ label, value, onRemove, removeLabel, className, ...props }: FilterChipProps) {
    const accessibleLabel = removeLabel || (typeof label === "string" ? `移除筛选：${label}` : "移除筛选");

    return (
        <span className={cn("pc-filter-chip", className)} {...props}>
            <span className="pc-filter-chip__label">{label}</span>
            {value !== undefined ? <span className="pc-filter-chip__value">{value}</span> : null}
            {onRemove ? (
                <button type="button" className="pc-filter-chip__remove" aria-label={accessibleLabel} onClick={onRemove}>
                    <X aria-hidden="true" />
                </button>
            ) : null}
        </span>
    );
}

export type ViewToggleOption<Value extends string = string> = {
    value: Value;
    label: ReactNode;
    icon?: ReactNode;
    ariaLabel?: string;
    disabled?: boolean;
};

export type ViewToggleProps<Value extends string = string> = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
    value: Value;
    options: readonly ViewToggleOption<Value>[];
    onChange: (value: Value) => void;
    ariaLabel?: string;
    compact?: boolean;
};

export function ViewToggle<Value extends string>({ value, options, onChange, ariaLabel = "切换视图", compact = false, className, ...props }: ViewToggleProps<Value>) {
    return (
        <div className={cn("pc-view-toggle", compact && "pc-view-toggle--compact", className)} role="group" aria-label={ariaLabel} {...props}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={cn("pc-view-toggle__item", option.value === value && "is-active")}
                    aria-label={option.ariaLabel}
                    aria-pressed={option.value === value}
                    disabled={option.disabled}
                    onClick={() => onChange(option.value)}
                >
                    {option.icon ? <span className="pc-view-toggle__icon">{option.icon}</span> : null}
                    <span className="pc-view-toggle__label">{option.label}</span>
                </button>
            ))}
        </div>
    );
}
