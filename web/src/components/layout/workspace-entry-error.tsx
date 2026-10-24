import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState } from "@/components/layout/workspace-state";
import { reloadAfterChunkFailure } from "@/lib/chunk-recovery";

export function WorkspaceEntryError() {
    return <WorkspacePage><WorkspaceErrorState title="页面暂时无法打开" description="页面模块加载失败，请检查连接后重新加载。" onRetry={reloadAfterChunkFailure} /></WorkspacePage>;
}
