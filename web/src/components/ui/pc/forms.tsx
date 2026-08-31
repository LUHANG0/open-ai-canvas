import { Drawer, Modal, type DrawerProps, type ModalProps } from "antd";
import { useId, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./pc-ui.css";

export type FormSectionProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
    title: ReactNode;
    titleId?: string;
    description?: ReactNode;
    actions?: ReactNode;
    requiredHint?: ReactNode;
};

export function FormSection({ title, titleId: providedTitleId, description, actions, requiredHint, className, children, ...props }: FormSectionProps) {
    const generatedId = useId();
    const titleId = providedTitleId || `${generatedId}-title`;

    return (
        <section className={cn("pc-form-section", className)} aria-labelledby={titleId} {...props}>
            <header className="pc-form-section__header">
                <div className="pc-form-section__copy">
                    <h2 id={titleId} className="pc-form-section__title">
                        {title}
                    </h2>
                    {description ? <div className="pc-form-section__description">{description}</div> : null}
                </div>
                {requiredHint || actions ? (
                    <div className="pc-form-section__header-actions">
                        {requiredHint ? <span className="pc-form-section__required-hint">{requiredHint}</span> : null}
                        {actions}
                    </div>
                ) : null}
            </header>
            <div className="pc-form-section__body">{children}</div>
        </section>
    );
}

export type DialogFrameSize = "sm" | "md" | "lg";

export type DialogFrameProps = Omit<ModalProps, "title" | "width"> & {
    title: ReactNode;
    subtitle?: ReactNode;
    frameSize?: DialogFrameSize;
};

const DIALOG_WIDTHS: Record<DialogFrameSize, number> = {
    sm: 480,
    md: 640,
    lg: 920,
};

export function DialogFrame({ title, subtitle, frameSize = "md", rootClassName, className, centered = true, ...props }: DialogFrameProps) {
    return (
        <Modal
            {...props}
            centered={centered}
            width={DIALOG_WIDTHS[frameSize]}
            rootClassName={cn("pc-dialog-root", rootClassName)}
            className={cn("pc-dialog", `pc-dialog--${frameSize}`, className)}
            title={
                <div className="pc-dialog__heading">
                    <div className="pc-dialog__title">{title}</div>
                    {subtitle ? <div className="pc-dialog__subtitle">{subtitle}</div> : null}
                </div>
            }
        />
    );
}

export type DrawerFrameSize = "sm" | "md" | "lg";

export type DrawerFrameProps = Omit<DrawerProps, "title" | "width" | "size"> & {
    title: ReactNode;
    subtitle?: ReactNode;
    frameSize?: DrawerFrameSize;
};

const DRAWER_WIDTHS: Record<DrawerFrameSize, number> = {
    sm: 400,
    md: 520,
    lg: 720,
};

export function DrawerFrame({ title, subtitle, frameSize = "md", rootClassName, className, placement = "right", ...props }: DrawerFrameProps) {
    return (
        <Drawer
            {...props}
            placement={placement}
            width={DRAWER_WIDTHS[frameSize]}
            rootClassName={cn("pc-drawer-root", rootClassName)}
            className={cn("pc-drawer", `pc-drawer--${frameSize}`, className)}
            title={
                <div className="pc-drawer__heading">
                    <div className="pc-drawer__title">{title}</div>
                    {subtitle ? <div className="pc-drawer__subtitle">{subtitle}</div> : null}
                </div>
            }
        />
    );
}
