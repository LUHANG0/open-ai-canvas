import { useMemo } from "react";
import { canvasResultRecord } from "@/lib/canvas/canvas-result-record";
import { producedModelLabel } from "@/lib/canvas/produced-model";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasNodeData } from "@/types/canvas";
import { GenerationResultMetadata } from "@/components/ai/generation-result-metadata";
import "./canvas-node-result-record.css";

export function CanvasNodeResultRecord({ node, enabled }: { node: CanvasNodeData; enabled: boolean }) {
    const channels = useConfigStore((state) => state.config.channels);
    const customChannelsEnabled = useUserStore((state) => state.features.customChannelsEnabled);
    const visibleChannels = useMemo(() => customChannelsEnabled ? channels : channels.filter((channel) => channel.scope === "system"), [channels, customChannelsEnabled]);
    const record = enabled ? canvasResultRecord(node) : null;
    if (!record) return null;
    const model = node.metadata?.resultRecord?.model ? record.model : producedModelLabel({ channels: visibleChannels }, record.model);
    const label = [model, ...record.facts].filter(Boolean).join(" · ");
    return <div className="canvas-node-result-record" role="group" aria-label={`${record.model ? "生成记录" : "素材信息"}：${label}`} title={label}
        onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <GenerationResultMetadata labelled record={{ ...record, model }} />
    </div>;
}
