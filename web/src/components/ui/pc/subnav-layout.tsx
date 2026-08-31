import { useId, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./pc-ui.css";

export type SubnavItem<Value extends string = string> = {
    value: Value;
    label: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    badge?: ReactNode;
    disabled?: boolean;
};

export type SubnavLayoutProps<Value extends string = string> = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
    items: readonly SubnavItem<Value>[];
    activeValue: Value;
    onChange: (value: Value) => void;
    ariaLabel?: string;
    navigationHeader?: ReactNode;
    navigationFooter?: ReactNode;
    contentHeader?: ReactNode;
};

export function SubnavLayout<Value extends string>({ items, activeValue, onChange, ariaLabel = "页面分区", navigationHeader, navigationFooter, contentHeader, className, children, ...props }: SubnavLayoutProps<Value>) {
    const generatedId = useId();
    const activeIndex = items.findIndex((item) => item.value === activeValue);
    const activeItemId = activeIndex >= 0 ? `${generatedId}-item-${activeIndex}` : undefined;

    return (
        <div className={cn("pc-subnav-layout", className)} {...props}>
            <aside className="pc-subnav-layout__rail">
                {navigationHeader ? <div className="pc-subnav-layout__rail-header">{navigationHeader}</div> : null}
                <nav className="pc-subnav-layout__nav" aria-label={ariaLabel}>
                    {items.map((item, index) => {
                        const active = item.value === activeValue;
                        return (
                            <button
                                key={item.value}
                                id={`${generatedId}-item-${index}`}
                                type="button"
                                className={cn("pc-subnav-layout__item", active && "is-active")}
                                aria-current={active ? "page" : undefined}
                                disabled={item.disabled}
                                onClick={() => onChange(item.value)}
                            >
                                {item.icon ? <span className="pc-subnav-layout__item-icon">{item.icon}</span> : null}
                                <span className="pc-subnav-layout__item-copy">
                                    <span className="pc-subnav-layout__item-label">{item.label}</span>
                                    {item.description ? <span className="pc-subnav-layout__item-description">{item.description}</span> : null}
                                </span>
                                {item.badge ? <span className="pc-subnav-layout__item-badge">{item.badge}</span> : null}
                            </button>
                        );
                    })}
                </nav>
                {navigationFooter ? <div className="pc-subnav-layout__rail-footer">{navigationFooter}</div> : null}
            </aside>
            <section className="pc-subnav-layout__content" aria-labelledby={activeItemId}>
                {contentHeader ? <div className="pc-subnav-layout__content-header">{contentHeader}</div> : null}
                <div className="pc-subnav-layout__content-body">{children}</div>
            </section>
        </div>
    );
}
