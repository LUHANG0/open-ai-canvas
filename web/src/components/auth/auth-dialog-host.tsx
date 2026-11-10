import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router";

import { safeAuthNext } from "@/lib/auth-navigation";
import { useAuthDialogStore } from "@/stores/use-auth-dialog-store";
import { useUserStore } from "@/stores/use-user-store";

const BrandAuthDialog = lazy(() => import("@/components/brand/brand-auth-dialog"));

/** Keep in-place sign-in on the same verified forms as the public brand routes. */
export function AuthDialogHost() {
    const open = useAuthDialogStore((state) => state.open);
    const view = useAuthDialogStore((state) => state.view);
    const next = useAuthDialogStore((state) => state.next);
    const signedIn = useUserStore((state) => Boolean(state.user));
    const location = useLocation();
    useEffect(() => {
        if (signedIn && open) useAuthDialogStore.getState().closeDialog();
    }, [signedIn, open]);
    if (!open || signedIn) return null;
    return (
        <Suspense fallback={null}>
            <BrandAuthDialog
                next={safeAuthNext(next ?? location.pathname + location.search + location.hash)}
                routeMode={view === "recovery" ? "forgot-password" : view}
                onModeChange={(mode) => useAuthDialogStore.getState().setView(mode === "forgot-password" ? "recovery" : mode === "invitation" ? "register" : mode)}
                onClosed={() => useAuthDialogStore.getState().closeDialog()}
            />
        </Suspense>
    );
}
