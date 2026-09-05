import type { Group, Path } from "leafer-ui";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasDisplayConnection, CanvasNodeData } from "@/types/canvas";

type ConnectionGraphicStyle = { stroke: string; strokeWidth: number; opacity: number };
type ConnectionGraphicAttributes = ConnectionGraphicStyle & { path: string };
type EndpointGeometry = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    handleId?: string;
    scrollTop: number;
    rows?: ReadonlyArray<{ id: string }>;
    composerHeight?: number;
};
type ConnectionGraphicEntry = {
    graphic: Path;
    from: EndpointGeometry;
    to: EndpointGeometry;
    attributes: ConnectionGraphicAttributes;
};

type ConnectionGraphicsOptions = {
    displayConnections: readonly CanvasDisplayConnection[];
    selectedConnectionId: string | null;
    relatedConnectionIds: ReadonlySet<string>;
    scriptScrollTopById: Readonly<Record<string, number>>;
    theme: CanvasTheme;
};

/** Keep scene objects alive across drag previews; only changed geometry dirties a path. */
export class CanvasConnectionGraphics {
    private readonly entries = new Map<string, ConnectionGraphicEntry>();

    constructor(
        private readonly group: Group,
        private readonly createPath: (attributes: ConnectionGraphicAttributes) => Path,
        private readonly connectionPath: (display: CanvasDisplayConnection, fromScrollTop: number, toScrollTop: number) => string,
    ) {}

    sync({ displayConnections, selectedConnectionId, relatedConnectionIds, scriptScrollTopById, theme }: ConnectionGraphicsOptions) {
        const visibleIds = new Set(displayConnections.map(({ connection }) => connection.id));
        for (const [id, entry] of this.entries) {
            if (visibleIds.has(id)) continue;
            this.group.remove(entry.graphic, true);
            this.entries.delete(id);
        }

        displayConnections.forEach((display, index) => {
            const { connection, from, to } = display;
            const fromScrollTop = scriptScrollTopById[from.id] || 0;
            const toScrollTop = scriptScrollTopById[to.id] || 0;
            const emphasized = selectedConnectionId === connection.id || relatedConnectionIds.has(connection.id);
            const stroke = emphasized ? theme.canvas.selectionStroke : theme.node.muted;
            const strokeWidth = emphasized ? 1.6 : 1;
            const opacity = emphasized ? 0.52 : 0.24;
            let entry = this.entries.get(connection.id);

            if (!entry) {
                const attributes = { path: this.connectionPath(display, fromScrollTop, toScrollTop), stroke, strokeWidth, opacity };
                entry = {
                    graphic: this.createPath(attributes),
                    from: captureEndpoint(from, connection.fromHandleId, fromScrollTop),
                    to: captureEndpoint(to, connection.toHandleId, toScrollTop),
                    attributes,
                };
                this.entries.set(connection.id, entry);
            } else {
                const geometryChanged = !sameEndpoint(entry.from, from, connection.fromHandleId, fromScrollTop) || !sameEndpoint(entry.to, to, connection.toHandleId, toScrollTop);
                const styleChanged = stroke !== entry.attributes.stroke || strokeWidth !== entry.attributes.strokeWidth || opacity !== entry.attributes.opacity;
                if (geometryChanged || styleChanged) {
                    const patch: Partial<ConnectionGraphicAttributes> = {};
                    if (geometryChanged) {
                        const path = this.connectionPath(display, fromScrollTop, toScrollTop);
                        if (path !== entry.attributes.path) patch.path = path;
                        entry.from = captureEndpoint(from, connection.fromHandleId, fromScrollTop);
                        entry.to = captureEndpoint(to, connection.toHandleId, toScrollTop);
                    }
                    if (stroke !== entry.attributes.stroke) patch.stroke = stroke;
                    if (strokeWidth !== entry.attributes.strokeWidth) patch.strokeWidth = strokeWidth;
                    if (opacity !== entry.attributes.opacity) patch.opacity = opacity;
                    if (Object.keys(patch).length) {
                        entry.graphic.set(patch);
                        Object.assign(entry.attributes, patch);
                    }
                }
            }

            // add(existing, index) reorders without destroying the Leafer object.
            if (this.group.children[index] !== entry.graphic) this.group.add(entry.graphic, index);
        });
    }

    destroy() {
        this.group.removeAll(true);
        this.entries.clear();
    }
}

function captureEndpoint(node: CanvasNodeData, handleId: string | undefined, scrollTop: number): EndpointGeometry {
    const rowHandle = Boolean(handleId?.startsWith("row:"));
    return {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.width,
        height: node.height,
        handleId,
        scrollTop: rowHandle ? scrollTop : 0,
        rows: rowHandle ? node.metadata?.storyboard?.rows : undefined,
        composerHeight: rowHandle || handleId === "storyboard:context" ? node.metadata?.storyboardComposerHeight : undefined,
    };
}

function sameEndpoint(previous: EndpointGeometry, node: CanvasNodeData, handleId: string | undefined, scrollTop: number) {
    const rowHandle = Boolean(handleId?.startsWith("row:"));
    return previous.id === node.id && previous.x === node.position.x && previous.y === node.position.y
        && previous.width === node.width && previous.height === node.height && previous.handleId === handleId
        && previous.scrollTop === (rowHandle ? scrollTop : 0)
        && previous.rows === (rowHandle ? node.metadata?.storyboard?.rows : undefined)
        && previous.composerHeight === (rowHandle || handleId === "storyboard:context" ? node.metadata?.storyboardComposerHeight : undefined);
}
