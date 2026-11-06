import { useLayoutEffect, useState } from "react";
import type { AgentLauncherObstacle } from "@/lib/canvas/agent-launcher-position";

const selector = "[data-agent-launcher-avoid]";

/** 全局入口只有一个实例；仅测量明确标记的操作区，不扫描所有按钮或跟随流式文本更新。 */
export function useAgentLauncherObstacles() {
    const [obstacles, setObstacles] = useState<AgentLauncherObstacle[]>([]);
    useLayoutEffect(() => {
        let targets: Element[] = [];
        let frame = 0;
        const measure = () => {
            frame = 0;
            const next = targets.flatMap((target) => {
                const { left, top, right, bottom, width, height } = target.getBoundingClientRect();
                return width > 0 && height > 0 ? [{ left, top, right, bottom }] : [];
            });
            setObstacles((current) => current.length === next.length && current.every((rect, i) => rect.left === next[i].left && rect.top === next[i].top && rect.right === next[i].right && rect.bottom === next[i].bottom) ? current : next);
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(measure);
        };
        const resize = new ResizeObserver(schedule);
        const syncTargets = () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            targets = Array.from(document.querySelectorAll(selector));
            for (const target of targets) resize.observe(target);
            measure();
        };
        const containsTarget = (node: Node) => node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)));
        const mounts = new MutationObserver((records) => {
            if (records.some((record) => Array.from(record.addedNodes).some(containsTarget) || Array.from(record.removedNodes).some(containsTarget))) syncTargets();
        });
        syncTargets();
        mounts.observe(document.body, { childList: true, subtree: true });
        window.addEventListener("resize", schedule);
        window.addEventListener("scroll", schedule, { capture: true, passive: true });
        return () => {
            mounts.disconnect();
            resize.disconnect();
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", schedule);
            window.removeEventListener("scroll", schedule, true);
        };
    }, []);
    return obstacles;
}
