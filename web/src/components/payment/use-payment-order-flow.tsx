import { App, Button } from "antd";
import { CreditCard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { PaymentCheckoutCode } from "@/components/payment-checkout-code";
import { AppModal } from "@/components/ui/product/app-modal";
import { translate } from "@/i18n";
import { getActiveUserScope } from "@/lib/user-scope";
import { useUserStore } from "@/stores/use-user-store";
import { createClientUUID } from "@/lib/client-id";
import { paymentOrderGrantLabel } from "@/lib/payment-order-grant";
import { closePaymentOrder, createPaymentOrder, formatPaymentAmount, getPaymentOrder, queryPaymentOrder, refreshPaymentCheckout, type PaymentOrder } from "@/services/api/payments";

function grantedText(order: PaymentOrder) {
    return order.productKind === "storage" ? translate("account.payment.grantedStorage") : translate("account.payment.grantedCredits");
}

function notGrantedText(order: PaymentOrder) {
    return order.productKind === "storage" ? translate("account.payment.closedStorage") : translate("account.payment.closedCredits");
}

/**
 * 在线支付下单、扫码、轮询、关单与重建收银台的共用流程。
 * onGranted 对每个订单只触发一次，调用方在其中刷新余额或容量。
 */
export function usePaymentOrderFlow({ onGranted }: { onGranted: (order: PaymentOrder) => Promise<void> | void }) {
    const owner = useRef(useUserStore.getState().user?.id).current;
    const scope = useRef(getActiveUserScope()).current;
    const live = useRef(true);
    const creatingRef = useRef(false);
    const queryRef = useRef(false);
    const orderRequest = useRef(0);
    const active = () => live.current && owner === useUserStore.getState().user?.id && scope === getActiveUserScope();
    useEffect(() => {
        live.current = true;
        const unsubscribe = useUserStore.subscribe((next, previous) => {
            if (next.user?.id !== previous.user?.id || (!next.hydrated && previous.hydrated)) live.current = false;
        });
        return () => {
            live.current = false;
            unsubscribe();
        };
    }, []);
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [order, setOrder] = useState<PaymentOrder | null>(null);
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [querying, setQuerying] = useState(false);
    const [clock, setClock] = useState(Date.now());
    const idempotencyKey = useRef("");
    const grantedOrderIds = useRef(new Set<string>());
    const onGrantedRef = useRef(onGranted);
    onGrantedRef.current = onGranted;

    const settle = async (next: PaymentOrder) => {
        if (!active() || next.status !== "credited" || grantedOrderIds.current.has(next.id)) return;
        grantedOrderIds.current.add(next.id);
        await onGrantedRef.current(next);
    };

    useEffect(() => {
        if (!open || !order || !["created", "pending", "closing"].includes(order.status)) return;
        const interval = window.setInterval(() => {
            void refresh(order.id, true);
        }, 4_000);
        return () => window.clearInterval(interval);
    }, [open, order?.id, order?.status]);

    useEffect(() => {
        if (!open) return;
        const interval = window.setInterval(() => setClock(Date.now()), 1_000);
        return () => window.clearInterval(interval);
    }, [open]);

    /** 切换商品或支付方式后必须换新的幂等键，否则后端会拒绝“同键不同单”。 */
    const resetIdempotency = () => {
        idempotencyKey.current = "";
    };

    const start = async (productId: string, providerId: string, method?: string) => {
        if (!active() || creatingRef.current) return;
        creatingRef.current = true;
        const sequence = ++orderRequest.current;
        setCreating(true);
        try {
            if (!idempotencyKey.current) idempotencyKey.current = createClientUUID();
            const result = await createPaymentOrder({ productId, providerId, ...(method ? { method } : {}), idempotencyKey: idempotencyKey.current });
            if (!active() || sequence !== orderRequest.current) return;
            idempotencyKey.current = "";
            setOrder(result.order);
            await settle(result.order);
            if (!active() || sequence !== orderRequest.current) return;
            if (result.order.checkout.mode === "redirect" && result.order.checkout.url) {
                window.location.assign(result.order.checkout.url);
                return;
            }
            setOpen(true);
        } catch (error) {
            if (active() && sequence === orderRequest.current) message.error(error instanceof Error ? error.message : t("account.payment.createFailed"));
        } finally {
            creatingRef.current = false;
            if (active()) setCreating(false);
        }
    };

    /** 支付跳转返回后展示指定订单的结果。 */
    const showOrder = async (orderId: string) => {
        if (!active()) return;
        const sequence = ++orderRequest.current;
        try {
            const result = await getPaymentOrder(orderId);
            if (!active() || sequence !== orderRequest.current) return;
            setOrder(result.order);
            setOpen(true);
            await settle(result.order);
        } catch (error) {
            if (active() && sequence === orderRequest.current) message.error(error instanceof Error ? error.message : t("account.payment.loadFailed"));
        }
    };

    async function refresh(orderId = order?.id, silent = false) {
        if (!orderId || !active() || queryRef.current) return;
        queryRef.current = true;
        const sequence = orderRequest.current;
        setQuerying(true);
        try {
            const result = await queryPaymentOrder(orderId);
            if (!active() || sequence !== orderRequest.current) return;
            setOrder(result.order);
            if (result.order.status === "credited") {
                await settle(result.order);
                if (!active() || sequence !== orderRequest.current) return;
                if (!silent) message.success(grantedText(result.order));
            } else if (!silent && result.order.status === "closed") message.warning(notGrantedText(result.order));
            else if (!silent) message.info(t("account.payment.notConfirmed"));
        } catch (error) {
            if (active() && sequence === orderRequest.current && !silent) message.error(error instanceof Error ? error.message : t("account.payment.queryFailed"));
        } finally {
            queryRef.current = false;
            if (active()) setQuerying(false);
        }
    }

    const cancel = async () => {
        if (!order || !active() || queryRef.current) return;
        queryRef.current = true;
        const sequence = orderRequest.current;
        setQuerying(true);
        try {
            const result = await closePaymentOrder(order.id);
            if (!active() || sequence !== orderRequest.current) return;
            setOrder(result.order);
            if (result.order.status === "credited") await settle(result.order);
            else message.success(t("account.payment.orderClosed"));
        } catch (error) {
            if (active() && sequence === orderRequest.current) message.error(error instanceof Error ? error.message : t("account.payment.closeFailed"));
        } finally {
            queryRef.current = false;
            if (active()) setQuerying(false);
        }
    };

    const retry = async () => {
        if (!order || !active() || queryRef.current) return;
        queryRef.current = true;
        const sequence = orderRequest.current;
        setQuerying(true);
        try {
            const result = await refreshPaymentCheckout(order.id);
            if (!active() || sequence !== orderRequest.current) return;
            setOrder(result.order);
            if (result.order.checkout.mode === "redirect" && result.order.checkout.url) window.location.assign(result.order.checkout.url);
        } catch (error) {
            if (active() && sequence === orderRequest.current) message.error(error instanceof Error ? error.message : t("account.payment.refreshFailed"));
        } finally {
            queryRef.current = false;
            if (active()) setQuerying(false);
        }
    };

    const close = () => setOpen(false);

    const dialog = (
        <AppModal
            open={open}
            title={
                order?.status === "credited" ? (order.productKind === "storage" ? t("account.payment.storageDone") : t("account.payment.topupDone")) : order?.checkout.mode === "qr_code" ? t("account.payment.scanTitle") : t("account.payment.confirmTitle")
            }
            centered
            width={430}
            onCancel={close}
            footer={paymentFooter(order, querying, close, cancel, () => refresh(), retry)}
        >
            {order ? (
                <div className="workspace-wallet-payment">
                    <span className="workspace-wallet-payment-icon">
                        <CreditCard />
                    </span>
                    <strong>{formatPaymentAmount(order.amountFen, order.currency)}</strong>
                    {order.chargeCurrency && order.chargeCurrency !== order.currency ? (
                        <span>
                            {order.exchangeRate
                                ? t("account.payment.chargeWithRate", { amount: formatPaymentAmount(order.chargeAmountFen, order.chargeCurrency), rate: order.exchangeRate })
                                : t("account.payment.charge", { amount: formatPaymentAmount(order.chargeAmountFen, order.chargeCurrency) })}
                        </span>
                    ) : null}
                    <p>
                        {order.productName} · {paymentOrderGrantLabel(order)}
                    </p>
                    {order.status === "pending" && order.checkout.mode === "qr_code" && order.checkout.value ? (
                        <>
                            <PaymentCheckoutCode value={order.checkout.value} />
                            <span>{t("account.payment.scanHint")}</span>
                        </>
                    ) : null}
                    <PaymentStatus order={order} now={clock} />
                </div>
            ) : null}
        </AppModal>
    );

    return { creating, start, showOrder, resetIdempotency, dialog };
}

function PaymentStatus({ order, now }: { order: PaymentOrder; now: number }) {
    const { t } = useTranslation();
    if (order.status === "credited") return <div className="workspace-wallet-payment-status is-success">{grantedText(order)}</div>;
    if (order.status === "closed") return <div className="workspace-wallet-payment-status">{notGrantedText(order)}</div>;
    if (order.status === "create_failed") return <div className="workspace-wallet-payment-status is-error">{t("account.payment.createCheckoutFailed")}</div>;
    const remaining = Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - now) / 1000));
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return <div className="workspace-wallet-payment-status">{t("account.payment.remaining", { time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` })}</div>;
}

function paymentFooter(order: PaymentOrder | null, loading: boolean, close: () => void, cancel: () => Promise<void>, query: () => Promise<void>, retry: () => Promise<void>) {
    if (order?.status === "pending")
        return [
            <Button key="cancel" danger disabled={loading} onClick={() => void cancel()}>
                {translate("account.payment.closeOrder")}
            </Button>,
            <Button key="query" type="primary" loading={loading} onClick={() => void query()}>
                {translate("account.payment.paid")}
            </Button>,
        ];
    if (order?.status === "create_failed")
        return [
            <Button key="close" onClick={close}>
                {translate("account.payment.later")}
            </Button>,
            <Button key="retry" type="primary" loading={loading} onClick={() => void retry()}>
                {translate("account.payment.regenerate")}
            </Button>,
        ];
    return [
        <Button key="done" type="primary" onClick={close}>
            {translate("account.payment.done")}
        </Button>,
    ];
}
