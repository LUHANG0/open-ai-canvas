import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./styles/globals.css";
import "./styles/shared/model-picker.css";
import "./styles/shared/overlays.css";
import "./styles/shared/scrollbars.css";
import { RouterProvider } from "react-router";

import { AppBootstrapReady } from "@/components/ui/app-bootstrap-ready";
import { AppProviders } from "@/components/layout/app-providers";
import { router } from "@/router";
import { observeAuthNavigation } from "@/lib/auth-navigation";

const stopAuthNavigation = observeAuthNavigation(router);
if (import.meta.hot) import.meta.hot.dispose(stopAuthNavigation);

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppBootstrapReady />
        <AppProviders>
            <RouterProvider router={router} useTransitions={false} />
        </AppProviders>
    </React.StrictMode>,
);
