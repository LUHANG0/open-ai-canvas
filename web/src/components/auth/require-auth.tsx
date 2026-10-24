import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { FullScreenLoader } from "@/components/ui/aceternity/full-screen-loader";
import { useUserStore } from "@/stores/use-user-store";
import { loginPath } from "@/lib/auth-navigation";

export function RequireAuth({ children, allowAnonymous = false }: { children: ReactNode; allowAnonymous?: boolean }) {
    const location = useLocation();
    const hydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);

    if (!hydrated) return <FullScreenLoader />;
    if (!user && !allowAnonymous) return <Navigate to={loginPath(location.pathname + location.search + location.hash)} replace />;
    return children;
}
