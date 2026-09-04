import { Tooltip, type TooltipProps } from "antd";
import type { ReactNode } from "react";

export function CreationTooltipContent({ title, description }: { title: ReactNode; description?: ReactNode }) {
    return (
        <span className="creation-ui-tooltip-content">
            <strong>{title}</strong>
            {description ? <small>{description}</small> : null}
        </span>
    );
}

export function CreationTooltip({ rootClassName, mouseEnterDelay = 0.18, mouseLeaveDelay = 0.08, trigger = ["hover", "focus"], ...props }: TooltipProps) {
    const tooltipClassName = ["creation-ui-tooltip", rootClassName].filter(Boolean).join(" ");

    return <Tooltip {...props} rootClassName={tooltipClassName} mouseEnterDelay={mouseEnterDelay} mouseLeaveDelay={mouseLeaveDelay} trigger={trigger} />;
}
