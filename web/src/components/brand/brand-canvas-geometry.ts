export type DemoPoint = { x: number; y: number };
export const DEMO_WIDTH = 1060;
export const DEMO_NODE_WIDTH = 280;
export const DEMO_HEIGHT = 780;
export const initialDemoPoint = (index: number): DemoPoint => index === 0 ? { x: 40, y: 220 } : { x: 400 + (index - 1) % 2 * 340, y: 40 + Math.floor((index - 1) / 2) * 370 };
export const zoomDemoAt = (pan: DemoPoint, oldScale: number, newScale: number, point: DemoPoint): DemoPoint => ({ x: point.x - (point.x - pan.x) * newScale / oldScale, y: point.y - (point.y - pan.y) * newScale / oldScale });
export function demoConnection(from: DemoPoint, to: DemoPoint) {
    const x = from.x + DEMO_NODE_WIDTH, y = from.y + 145;
    const endX = to.x, endY = to.y + 145;
    const bend = Math.max(55, Math.abs(endX - x) * .5);
    return `M ${x} ${y} C ${x + bend} ${y}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}
