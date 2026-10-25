import { useEffect, useState } from "react";
import { AppLoading } from "@/components/ui/app-loading";
import { BrandSite } from "@/components/brand/brand-site";
import { DEFAULT_BRAND_CONTENT, getBrandSite } from "@/services/api/brand-site";
let publishedContent: typeof DEFAULT_BRAND_CONTENT | undefined;
export default function WelcomePage() {
    const [content, setContent] = useState(publishedContent);
    const [unavailable, setUnavailable] = useState(false);
    useEffect(() => {
        // The current document keeps its published version; a full refresh fetches a new one.
        if (publishedContent) return;
        const controller = new AbortController();
        void getBrandSite(controller.signal)
            .then((value) => { publishedContent = value; setContent(value); })
            .catch(() => {
                if (!controller.signal.aborted) {
                    setUnavailable(true);
                    setContent(DEFAULT_BRAND_CONTENT);
                }
            });
        return () => controller.abort();
    }, []);
    if (!content)
        return (
            <AppLoading brand screen />
        );
    return (
        <>
            {unavailable && (
                <p role="status" className="mc-site-unavailable">
                    官网内容暂不可用，当前显示梦层内置介绍。刷新页面可重试。
                </p>
            )}
            <BrandSite content={content} />
        </>
    );
}
