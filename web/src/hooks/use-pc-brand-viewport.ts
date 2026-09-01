import { useEffect, useState } from "react";

const PC_BRAND_MEDIA_QUERY = "(min-width: 1024px)";

function readPcBrandViewport() {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PC_BRAND_MEDIA_QUERY).matches;
}

/**
 * Brand V2 is a PC-only release. Keep the legacy user theme below the desktop
 * breakpoint so this visual refactor cannot silently change the mobile UI.
 */
export function usePcBrandViewport() {
    const [matches, setMatches] = useState(readPcBrandViewport);

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const media = window.matchMedia(PC_BRAND_MEDIA_QUERY);
        const update = () => setMatches(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    return matches;
}
