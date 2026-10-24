/** Static placeholders keep page geometry without implying a loaded empty collection. */
export function WorkspaceEntryPending({ conversation = false }: { conversation?: boolean }) {
    if (conversation) return (
        <div className="creation-home relative flex h-full min-h-0 flex-col overflow-hidden" aria-busy="true" aria-label="正在读取对话创作历史" data-workspace-entry-pending>
            <div className="creation-history-sync invisible" aria-hidden="true">正在读取历史</div>
            <main className="creation-home-scroll">
                <section className="creation-launchpad" aria-hidden="true">
                    <div className="creation-start-heading"><div className="h-14 w-72 max-w-full rounded-md bg-foreground/5" /></div>
                    <div className="h-64 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-strong)] p-5">
                        <div className="h-7 w-52 max-w-full rounded-md bg-foreground/5" />
                        <div className="mt-8 h-3 w-3/5 rounded-md bg-foreground/5" />
                        <div className="mt-3 h-3 w-2/5 rounded-md bg-foreground/5" />
                    </div>
                </section>
            </main>
        </div>
    );

    return <section className="grid gap-3 py-8 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="正在读取列表" data-workspace-entry-pending>
        {[0, 1, 2].map((key) => <div key={key} className="h-56 rounded-lg border border-[var(--workspace-border)] bg-foreground/[.025] p-4" aria-hidden="true"><div className="h-32 rounded-md bg-foreground/5" /><div className="mt-4 h-3 w-3/5 rounded-md bg-foreground/5" /><div className="mt-3 h-2 w-2/5 rounded-md bg-foreground/5" /></div>)}
    </section>;
}
