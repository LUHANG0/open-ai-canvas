import { Tooltip, type TooltipProps } from "antd";

export function CreationTooltip({ rootClassName, mouseEnterDelay = 0.25, mouseLeaveDelay = 0.08, trigger = ["hover", "focus"], ...props }: TooltipProps) {
    const tooltipClassName = ["creation-ui-tooltip", rootClassName].filter(Boolean).join(" ");

    return <Tooltip {...props} rootClassName={tooltipClassName} mouseEnterDelay={mouseEnterDelay} mouseLeaveDelay={mouseLeaveDelay} trigger={trigger} />;
}
