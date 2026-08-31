import { FileText } from "lucide-react";

import { DialogFrame } from "@/components/ui/pc";
import type { RegisteredPlugin } from "@/lib/plugins/plugin-types";

import { getPluginDocumentation } from "./plugin-documentation";
import { PluginMarkdown } from "./plugin-markdown";

type PluginDetailsDialogProps = {
    plugin?: RegisteredPlugin;
    restoreFocus: boolean;
    onClose: () => void;
};

export function PluginDetailsDialog({ plugin, restoreFocus, onClose }: PluginDetailsDialogProps) {
    return (
        <DialogFrame
            rootClassName="plugin-details-dialog-root"
            className="plugin-details-modal"
            title={
                plugin ? (
                    <div className="plugin-details-title">
                        <FileText className="size-4" />
                        <span>{plugin.manifest.name}</span>
                        <span className="plugin-version">v{plugin.manifest.version}</span>
                    </div>
                ) : null
            }
            subtitle="插件作者提供的使用说明与权限声明。"
            frameSize="lg"
            open={Boolean(plugin)}
            centered
            footer={null}
            destroyOnHidden
            focusTriggerAfterClose={restoreFocus}
            onCancel={onClose}
            styles={{ body: { maxHeight: "min(78vh, 820px)", overflowY: "auto", overscrollBehavior: "contain" } }}
        >
            {plugin ? <PluginMarkdown className="plugin-details-document" source={getPluginDocumentation(plugin.manifest)} /> : null}
        </DialogFrame>
    );
}
