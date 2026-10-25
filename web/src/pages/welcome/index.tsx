import { useEffect, useState } from "react";
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
            <main className="mengceng-site" style={{ minHeight: "100vh", padding: 40 }} role="status">
                梦层 MengCeng · 正在准备创作之旅
            </main>
        );
    return (
        <>
            {unavailable && (
                <p role="status" style={{ padding: 12, margin: 0, textAlign: "center", background: "#edf2fc", color: "#182b46" }}>
                    官网内容暂不可用，当前显示梦层内置介绍。刷新页面可重试。
                </p>
            )}
            <BrandSite content={content} />
        </>
    );
}
