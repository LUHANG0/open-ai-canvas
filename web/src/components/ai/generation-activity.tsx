import { useEffect, useRef, useState } from "react";
import "./generation-activity.css";

/** Ambient activity only; never represents a provider stage or percentage. */
export function GenerationActivity({ active = true, reduced = false, progress }: { active?: boolean; reduced?: boolean; progress?: number | null }) {
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
    return <div ref={element} className="generation-activity" data-active={active} data-playing={active && visible && !reduced} data-reduced-motion={reduced} >
        <svg aria-hidden="true" className="generation-field" viewBox="0 0 240 200" fill="none">
            <ellipse className="generation-field-track" cx="120" cy="100" rx="83" ry="63" />
            <circle className="generation-field-track" cx="120" cy="100" r="48" />
            <g className="generation-field-plane">
                <g className="generation-field-turn generation-field-turn-outer">
                    <circle cx="120" cy="100" r="76" pathLength="100" strokeDasharray="38 62" className="generation-field-tail" />
                    <circle cx="120" cy="100" r="76" pathLength="100" strokeDasharray="12 88" className="generation-field-light" />
                    <circle cx="196" cy="100" r="2.5" className="generation-field-point" />
                </g>
            </g>
            <g className="generation-field-turn generation-field-turn-inner">
                <circle cx="120" cy="100" r="48" pathLength="100" strokeDasharray="24 76" className="generation-field-light" />
                <circle cx="120" cy="100" r="48" pathLength="100" strokeDasharray="42 58" strokeDashoffset="-50" className="generation-field-tail" />
            </g>

        </svg>
        {typeof progress === "number" && Number.isFinite(progress) ? <span className="generation-field-progress" role="progressbar" aria-label="生成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, Math.round(progress)))}>
            <span>{Math.max(0, Math.min(100, Math.round(progress)))}</span><small>%</small>
        </span> : null}
    </div>;
}
