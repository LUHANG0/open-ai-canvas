import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./pc-ui.css";

export type SurfaceTone = "default" | "subtle" | "raised" | "overlay";
export type SurfacePadding = "none" | "sm" | "md" | "lg";

export type SurfaceProps = HTMLAttributes<HTMLElement> & {
    as?: "div" | "section" | "article" | "aside";
    tone?: SurfaceTone;
    padding?: SurfacePadding;
};

export function Surface({ as: Component = "section", tone = "default", padding = "md", className, children, ...props }: SurfaceProps) {
    return (
        <Component className={cn("pc-surface", `pc-surface--${tone}`, `pc-surface--padding-${padding}`, className)} {...props}>
            {children}
        </Component>
    );
}

export type SectionHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
    title: ReactNode;
    description?: ReactNode;
    eyebrow?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    headingLevel?: 2 | 3 | 4;
    titleId?: string;
};

export function SectionHeader({ title, description, eyebrow, meta, actions, headingLevel = 2, titleId, className, ...props }: SectionHeaderProps) {
    const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

    return (
        <header className={cn("pc-section-header", className)} {...props}>
            <div className="pc-section-header__copy">
                {eyebrow ? <div className="pc-section-header__eyebrow">{eyebrow}</div> : null}
                <div className="pc-section-header__title-row">
                    <Heading id={titleId} className="pc-section-header__title">
                        {title}
                    </Heading>
                    {meta ? <div className="pc-section-header__meta">{meta}</div> : null}
                </div>
                {description ? <div className="pc-section-header__description">{description}</div> : null}
            </div>
            {actions ? <div className="pc-section-header__actions">{actions}</div> : null}
        </header>
    );
}
