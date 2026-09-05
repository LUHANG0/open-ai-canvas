import type { ModalFuncProps } from "antd";

// Keep keyboard focus within these two-action confirmations, including the last Tab.
export const configurationConfirmProps: Pick<ModalFuncProps, "centered" | "width" | "focusable" | "modalRender"> = {
    centered: true,
    width: 440,
    focusable: { trap: false, autoFocusButton: "cancel" },
    modalRender: (node) => (
        <div
            onKeyDownCapture={(event) => {
                if (event.key !== "Tab") return;
                const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')).filter(
                    (element) => element.getClientRects().length > 0,
                );
                if (!controls.length) return;
                const index = controls.indexOf(document.activeElement as HTMLElement);
                if (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
                    event.preventDefault();
                    event.stopPropagation();
                    controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
                }
            }}
        >
            {node}
        </div>
    ),
};
