import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type LibraryCreateCardProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    label: ReactNode;
    description?: ReactNode;
    icon: ReactNode;
};

export function LibraryCreateCard({ label, description, icon, className, type = "button", ...props }: LibraryCreateCardProps) {
    return (
        <button type={type} className={cn("library-create-card", className)} {...props}>
            <span className="library-create-cover">{icon}</span>
            <span className="library-create-title">{label}</span>
            {description ? <span className="library-create-meta">{description}</span> : null}
        </button>
    );
}
