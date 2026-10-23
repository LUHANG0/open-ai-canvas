import { useRef } from "react";
import { History, TicketCheck, WalletCards } from "lucide-react";

export type WalletModalTab = "topup" | "redeem" | "history";

const TABS = [
    { value: "topup", label: "充值", Icon: WalletCards },
    { value: "redeem", label: "兑换", Icon: TicketCheck },
    { value: "history", label: "积分消耗历史", Icon: History },
] as const;

export function WorkspaceWalletTabs({ value, onChange, idPrefix }: { value: WalletModalTab; onChange: (value: WalletModalTab) => void; idPrefix: string }) {
    const refs = useRef<Array<HTMLButtonElement | null>>([]);
    const select = (next: WalletModalTab) => {
        if (next !== value) onChange(next);
    };

    return (
        <div className="workspace-wallet-tabs" role="tablist" aria-label="积分中心">
            {TABS.map(({ value: tab, label, Icon }, index) => (
                <button
                    key={tab}
                    ref={(element) => { refs.current[index] = element; }}
                    id={`${idPrefix}-tab-${tab}`}
                    type="button"
                    role="tab"
                    aria-selected={value === tab}
                    aria-controls={`${idPrefix}-panel-${tab}`}
                    tabIndex={value === tab ? 0 : -1}
                    onClick={() => select(tab)}
                    onKeyDown={(event) => {
                        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault();
                        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + TABS.length) % TABS.length;
                        refs.current[nextIndex]?.focus();
                        select(TABS[nextIndex].value);
                    }}
                >
                    <Icon aria-hidden="true" />
                    {label}
                </button>
            ))}
        </div>
    );
}
