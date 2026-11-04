import type { CanvasNodeData } from "@/types/canvas";

/** Only for geometry/topology consumers; never use this snapshot as node content. */
export function retainCanvasLayoutNodes(previous: CanvasNodeData[], nodes: CanvasNodeData[]) {
    return previous === nodes || (previous.length === nodes.length && nodes.every((node, index) => sameLayout(node, previous[index]))) ? previous : nodes;
}

function sameLayout(a: CanvasNodeData, b: CanvasNodeData) {
    return (
        a === b ||
        (a.id === b.id &&
            a.type === b.type &&
            a.parentId === b.parentId &&
            a.position.x === b.position.x &&
            a.position.y === b.position.y &&
            a.width === b.width &&
            a.height === b.height &&
            a.metadata?.batchRootId === b.metadata?.batchRootId &&
            a.metadata?.imageBatchExpanded === b.metadata?.imageBatchExpanded &&
            a.metadata?.frame?.collapsed === b.metadata?.frame?.collapsed)
    );
}

/** Connection ports also depend on table structure and composer height, but not
 * row text, task status or other semantic metadata. Keep this snapshot separate
 * from the node-box index so port edits do not invalidate node virtualization. */
export function retainCanvasConnectionLayoutNodes(previous: CanvasNodeData[], nodes: CanvasNodeData[]) {
    return previous === nodes ||
        (previous.length === nodes.length &&
            nodes.every((node, index) => {
                const old = previous[index];
                if (!sameLayout(node, old)) return false;
                if (node === old || node.metadata === old.metadata) return true;
                return (
                    node.metadata?.storyboardComposerHeight === old.metadata?.storyboardComposerHeight &&
                    samePortIds(node.metadata?.storyboard?.rows, old.metadata?.storyboard?.rows) &&
                    Boolean(node.metadata?.batchTable) === Boolean(old.metadata?.batchTable) &&
                    samePortIds(node.metadata?.batchTable?.rows, old.metadata?.batchTable?.rows) &&
                    samePortIds(node.metadata?.batchTable?.referenceColumns, old.metadata?.batchTable?.referenceColumns)
                );
            }))
        ? previous
        : nodes;
}

function samePortIds(a: readonly { id: string }[] | undefined, b: readonly { id: string }[] | undefined) {
    return a === b || (a?.length === b?.length && (!a || a.every((item, index) => item.id === b![index].id)));
}
