import { Outlet, type RouteObject } from "react-router";
import { BrandAuthProvider } from "@/components/brand/brand-auth-entry";
import { AuthScene } from "@/pages/auth/auth-scene";
import WelcomePage from ".";

function BrandPublicLayout() {
    return <BrandAuthProvider>
        <div className="mc-route-scroll"><WelcomePage /></div>
        <Outlet />
    </BrandAuthProvider>;
}

export const brandPublicRoutes: RouteObject = {
    element: <BrandPublicLayout />,
    children: [
        { path: "/", element: null },
        { path: "/login", element: <AuthScene /> },
        { path: "/register", element: <AuthScene /> },
        { path: "/forgot-password", element: <AuthScene /> },
        { path: "/i/:code", element: <AuthScene /> },
    ],
};
