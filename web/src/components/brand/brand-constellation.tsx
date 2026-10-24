import { useEffect, useRef } from "react";
import "./brand-constellation.css";

const FRAMES = [
    { src: "/brand/v5/gallery-world.webp", position: "world" },
    { src: "/brand/b/whale.webp", position: "sky" },
    { src: "/brand/b/architecture.webp", position: "architecture" },
    { src: "/brand/b/train.webp", position: "portrait" },
    { src: "/brand/v5/story-character.webp", position: "character" },
    { src: "/brand/v5/gallery-city.webp", position: "city" },
    { src: "/brand/b/wave.webp", position: "wave" },
    { src: "/brand/b/glass-city.webp", position: "detail" },
];

export function BrandConstellation({ variant = "auth" }: { variant?: "auth" }) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const element = root.current;
        if (!element || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => element.setAttribute("data-visible", String(entry.isIntersecting)));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return <div ref={root} className="mc-constellation" data-variant={variant} data-visible="true" aria-hidden="true">
        <div className="mc-constellation-layer">{FRAMES.map((frame) => <figure className={"mc-orbit mc-orbit-" + frame.position} key={frame.position}><div className="mc-orbit-drift"><img src={frame.src} alt="" width={1400} height={934} loading="lazy" decoding="async" /></div></figure>)}</div>
    </div>;
}
