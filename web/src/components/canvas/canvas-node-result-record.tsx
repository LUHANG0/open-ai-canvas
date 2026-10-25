import { useMemo, type KeyboardEvent } from "react";
import { canvasResultRecord } from "@/lib/canvas/canvas-result-record";
import { producedModelLabel } from "@/lib/canvas/produced-model";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasNodeData } from "@/types/canvas";
import "./canvas-node-result-record.css";

export function CanvasNodeResultRecord({ node, enabled }: { node: CanvasNodeData; enabled: boolean }) {
    const channels = useConfigStore((state) => state.config.channels);
    const customChannelsEnabled = useUserStore((state) => state.features.customChannelsEnabled);
    const visibleChannels = useMemo(() => customChannelsEnabled ? channels : channels.filter((channel) => channel.scope === "system"), [channels, customChannelsEnabled]);
    const record = enabled ? canvasResultRecord(node) : null;
    if (!record) return null;
    const model = producedModelLabel({ channels: visibleChannels }, record.model);
    const label = [model, ...record.facts].filter(Boolean).join(" · ");
    const scrollWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        event.stopPropagation();
        const row = event.currentTarget;
        if (row.scrollWidth <= row.clientWidth) return;
        const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (direction || event.key === "Home" || event.key === "End") {
            event.preventDefault();
            row.scrollLeft = direction ? row.scrollLeft + direction * row.clientWidth / 2 : event.key === "Home" ? 0 : row.scrollWidth;
        }
    };
    return <div className="canvas-node-result-record" role="group" aria-label={`生成记录：${label}`} title={label} tabIndex={0}
        data-canvas-no-zoom data-canvas-wheel-scroll
        onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()} onKeyDown={scrollWithKeyboard}>
        {model ? <span className="canvas-node-result-record-model" title={model}>{model}</span> : null}
        {record.facts.length ? <span className="canvas-node-result-record-facts">{model ? <span aria-hidden="true"> · </span> : null}{record.facts.join(" · ")}</span> : null}
    </div>;
}
