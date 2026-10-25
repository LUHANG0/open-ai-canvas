import { useEffect, useState } from "react";

export function useAuthReducedMotion() {
    const [reduced, setReduced] = useState(() => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    useEffect(() => {
        const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(media?.matches ?? true);
        update();
        media?.addEventListener("change", update);
        return () => media?.removeEventListener("change", update);
    }, []);
    return reduced;
}
