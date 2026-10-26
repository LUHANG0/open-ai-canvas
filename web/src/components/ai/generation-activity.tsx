import { useEffect, useRef, useState } from "react";
import { AudioLines, Film, Image, Sparkles } from "lucide-react";
import { OrbitingCircles } from "@/components/ui/fx/orbiting-circles";
import "./generation-activity.css";

/** Ambient activity only; never represents a provider stage or percentage. */
export function GenerationActivity({ active = true, reduced = false }: { active?: boolean; reduced?: boolean }) {
    const element = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const target = element.current;
        if (!target) return;
        let intersecting = true;
        const update = () => setVisible(intersecting && !document.hidden);
        const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; update(); });
        observer?.observe(target);
        document.addEventListener("visibilitychange", update);
        update();
        return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", update); };
    }, []);
    return <div ref={element} className="generation-activity" data-active={active} data-playing={active && visible && !reduced} data-reduced-motion={reduced} aria-hidden="true">
        <span className="generation-orbit-core"><Sparkles /></span>
        <OrbitingCircles><Film /><Image /><AudioLines /></OrbitingCircles>
        <OrbitingCircles radius={32} duration={12} reverse><i /><i /></OrbitingCircles>
    </div>;
}
