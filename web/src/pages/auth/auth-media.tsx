import { useState } from "react";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { BRAND_CONCEPT_POSTER } from "@/lib/public-site-content";

export function AuthMedia() {
    const { site } = usePublicSite();
    const [failedURL, setFailedURL] = useState("");
    const configuredURL = site.config.hero.posterUrl || BRAND_CONCEPT_POSTER;
    return (
        <div className="pc-auth-atmosphere" aria-hidden="true">
            <img className="pc-auth-atmosphere-media" src={failedURL === configuredURL ? BRAND_CONCEPT_POSTER : configuredURL} alt="" fetchPriority="high" onError={() => setFailedURL(configuredURL)} />
            <div className="pc-auth-atmosphere-grade" />
        </div>
    );
}
