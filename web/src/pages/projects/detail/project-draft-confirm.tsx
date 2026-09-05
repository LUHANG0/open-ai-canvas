import type { ModalFuncProps } from "antd";

// Keep these two-action draft confirmations from moving keyboard focus behind the dialog.
export const projectDraftConfirmProps: Pick<ModalFuncProps, "focusable" | "modalRender"> = {
    focusable: { trap: false, autoFocusButton: "cancel" },
    modalRender: (node) => (
        <div onKeyDownCapture={(event) => {
            if (event.key !== "Tab") return;
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])")).filter((button) => button.getClientRects().length > 0);
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (!buttons.length || (index >= 0 && (event.shiftKey ? index > 0 : index < buttons.length - 1))) return;
            event.preventDefault();
            event.stopPropagation();
            buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
        }}>
            {node}
        </div>
    ),
};
