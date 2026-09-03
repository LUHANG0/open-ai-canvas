import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { useBranding } from "@/components/branding/branding-provider";

export function AuthMedia() {
    const reducedMotion = useReducedMotion();
    const { branding } = useBranding();
    const [mediaFailed, setMediaFailed] = useState(false);
    const hero = branding.assets;

    useEffect(() => setMediaFailed(false), [hero.authHeroUrl]);

    const showVideo = Boolean(!reducedMotion && hero.authHeroKind === "video" && hero.authHeroUrl && !mediaFailed);
    const showImage = Boolean(hero.authHeroKind === "image" && hero.authHeroUrl && !mediaFailed);
    const showPoster = Boolean(hero.authHeroKind === "video" && hero.authHeroPosterUrl && !showVideo);

    return (
        <div className="pc-auth-atmosphere" aria-hidden="true">
            {showVideo ? (
                <video className="pc-auth-atmosphere-media" src={hero.authHeroUrl} poster={hero.authHeroPosterUrl || undefined} autoPlay muted loop playsInline preload="metadata" onError={() => setMediaFailed(true)} />
            ) : showImage || showPoster ? (
                <img className="pc-auth-atmosphere-media" src={showImage ? hero.authHeroUrl : hero.authHeroPosterUrl} alt="" referrerPolicy="no-referrer" onError={() => setMediaFailed(true)} />
            ) : (
                <div className="pc-auth-brand-ambient" />
            )}
            <div className="pc-auth-atmosphere-grade" />
            <div className="pc-auth-atmosphere-vignette" />
            <div className="pc-auth-atmosphere-glow" />
        </div>
    );
}
