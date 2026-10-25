import { useCallback, useEffect, useState } from "react";

/** Reveal a usable first frame, without waiting for video download or every page font. */
export function useHeroReadiness(preview: boolean) {
    const [mediaReady, setMediaReady] = useState(false);
    const [fontReady, setFontReady] = useState(false);
    const [timedOut, setTimedOut] = useState(false);
    const onReady = useCallback(() => setMediaReady(true), []);
    useEffect(() => {
        if (preview) return;
        let active = true;
        const fontTimer = window.setTimeout(() => setFontReady(true), 1500);
        const mediaTimer = window.setTimeout(() => setTimedOut(true), 8000);
        void document.fonts?.load('500 24px "Glow Sans SC"', "梦层").catch(() => undefined).then(() => {
            if (active) setFontReady(true);
        });
        if (!document.fonts) setFontReady(true);
        return () => { active = false; window.clearTimeout(fontTimer); window.clearTimeout(mediaTimer); };
    }, [preview]);
    return { ready: preview || (fontReady && (mediaReady || timedOut)), fallback: !preview && timedOut && !mediaReady, onReady };
}
