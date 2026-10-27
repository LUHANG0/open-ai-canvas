import type { ResultPresentation } from "@/lib/canvas/canvas-result-record";
import "./generation-result-metadata.css";

/** No requests or live timer: metadata belongs to the delivered result. */
function labelledFact(fact: string): string {
    if (/^\d+:\d+$/.test(fact)) return `画幅 ${fact}`;
    if (/^\d+(?:×\d+|[KP])$/.test(fact)) return `分辨率 ${fact}`;
    if (fact.includes("耗时")) return fact.replace(/^本次任务合计 · /, "合计 ").replace(/总耗时|任务耗时|生成耗时/, "耗时");
    if (fact.includes("积分")) return `积分 ${fact.replace(/^本次任务合计 · /, "合计 ").replace(/积分$/, "")}`;
    return fact;
}

export function GenerationResultMetadata({ record, labelled = false }: { record: ResultPresentation; labelled?: boolean }) {
    const primary = [record.model, ...record.facts].filter(Boolean).join(" · ");
    const description = [primary, ...record.details].filter(Boolean).join(" · ");

    return <div
        className="generation-result-metadata generation-result-metadata-summary"
        title={description}
        aria-label={description}
    >
        {record.model && <span className="generation-result-metadata-model generation-result-metadata-item">{labelled ? `模型 ${record.model}` : record.model}</span>}
        {record.facts.filter(Boolean).map((fact, index) => <span className="generation-result-metadata-fact generation-result-metadata-item" key={index}>
            <span className="generation-result-metadata-value">{labelled ? labelledFact(fact) : fact.replace(/^本次任务合计 · /, "合计 ").replace(/^(合计 )?(?:总耗时|任务耗时|生成耗时) /, "$1")}</span>
        </span>)}
    </div>;
}
