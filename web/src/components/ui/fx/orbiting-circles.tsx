// Adapted from Magic UI Orbiting Circles (MIT, Copyright (c) Magic UI).
// https://magicui.design/docs/components/orbiting-circles
// License: ./orbiting-circles.LICENSE.txt
// Adaptation: scoped CSS, explicit animation state, no Tailwind registry dependency.
import { Children, type CSSProperties, type ReactNode } from "react";

export function OrbitingCircles({ children, radius = 54, duration = 18, reverse = false }: { children: ReactNode; radius?: number; duration?: number; reverse?: boolean }) {
    return <>
        <svg className="generation-orbit-path" aria-hidden="true"><circle cx="50%" cy="50%" r={radius} fill="none" /></svg>
        {Children.map(children, (child, index) => <span className="generation-orbit-item" style={{
            "--orbit-radius": `${radius}px`, "--orbit-angle": `${360 / Children.count(children) * index}deg`,
            animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal",
        } as CSSProperties}>{child}</span>)}
    </>;
}
