import { Children, Component, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import "@/styles/document-reading.css";

type DocumentMarkdownProps = {
    source: string;
    className?: string;
    components?: Components;
};

function codeText(children: ReactNode): string {
    return Children.toArray(children).map((child): string => {
        if (typeof child === "string" || typeof child === "number") return String(child);
        return isValidElement<{ children?: ReactNode }>(child) ? codeText(child.props.children) : "";
    }).join("");
}

function DocumentCodeBlock({ children }: { children?: ReactNode }) {
    const code = Children.toArray(children).find((child) => isValidElement(child));
    const language = isValidElement<{ className?: string }>(code) ? code.props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1] : undefined;
    const lines = codeText(children).trimEnd().split(/\r?\n/).length;
    const block = <pre tabIndex={0} role="region" aria-label={language ? `${language} 代码，可滚动阅读` : "代码示例，可滚动阅读"}>{children}</pre>;
    return language?.toLowerCase() === "json" && lines >= 16 ? (
        <details className="document-code-details">
            <summary>JSON 技术参考 · {lines} 行（展开查看完整代码）</summary>
            {block}
        </details>
    ) : block;
}

class DocumentPreviewBoundary extends Component<{ source: string; children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        if (this.state.failed) return <>
            <p role="alert">说明预览未能完成，以下保留原始正文；也可查看原始来源。</p>
            <pre className="document-reading-fallback" tabIndex={0} role="region" aria-label="原始说明正文">{this.props.source}</pre>
        </>;
        return this.props.children;
    }
}

/** Read-only skill/plugin documents share typography and local overflow boundaries. */
export function DocumentMarkdown({ source, className = "", components }: DocumentMarkdownProps) {
    return (
        <article className={`document-reading ${className}`.trim()}>
            <DocumentPreviewBoundary key={source} source={source}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                    table: ({ children }) => <div className="document-table-scroll" tabIndex={0} role="region" aria-label="说明表格，可左右滚动"><table>{children}</table></div>,
                    pre: ({ children }) => <DocumentCodeBlock>{children}</DocumentCodeBlock>,
                    ...components,
                }}>{source}</ReactMarkdown>
            </DocumentPreviewBoundary>
        </article>
    );
}
