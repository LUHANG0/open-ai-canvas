import { DocumentMarkdown } from "@/components/document-markdown";

type PluginMarkdownProps = {
    source: string;
    className?: string;
};

export function PluginMarkdown({ source, className = "" }: PluginMarkdownProps) {
    return (
        <DocumentMarkdown source={source} className={`plugin-markdown ${className}`.trim()} />
    );
}
