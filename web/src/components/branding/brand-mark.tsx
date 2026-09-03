import { useState } from "react";

import { cn } from "@/lib/utils";
import { useBranding } from "./branding-provider";

export function BrandMark({ className, decorative = true }: { className?: string; decorative?: boolean }) {
    const { branding } = useBranding();
    const [failedURL, setFailedURL] = useState("");
    const configuredURL = branding.assets.logoUrl || "/logo.svg";
    const src = failedURL === configuredURL ? "/logo.svg" : configuredURL;
    return <img className={cn("object-contain", className)} src={src} alt={decorative ? "" : branding.config.identity.displayName} aria-hidden={decorative || undefined} onError={() => setFailedURL(configuredURL)} />;
}
