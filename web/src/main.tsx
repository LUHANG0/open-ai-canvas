import { runLocalRuntimeBootstrap } from "@/services/local-runtime-bootstrap";

runLocalRuntimeBootstrap(
    {
        get href() {
            return window.location.href;
        },
        replaceUrl(url) {
            window.history.replaceState(window.history.state, "", url);
        },
        removeStorageItem(key) {
            window.localStorage.removeItem(key);
        },
    },
    () => {
        void import("./application").catch((error) => {
            console.error("应用启动失败", error);
            const loader = document.querySelector<HTMLElement>("[data-app-boot-loader]");
            if (!loader) return;
            loader.setAttribute("role", "alert");
            loader.setAttribute("aria-label", "暂时无法打开页面，请重新加载");
            loader.classList.add("no-motion");
            const label = loader.querySelector(".brand-loader-label");
            const detail = loader.querySelector(".brand-loader-detail");
            if (label) label.textContent = "暂时无法打开页面";
            if (detail) detail.textContent = "请检查网络连接后重试";
            const retry = loader.querySelector<HTMLButtonElement>(".brand-loader-retry");
            if (retry) {
                retry.hidden = false;
                retry.onclick = () => window.location.reload();
            }
        });
    },
);
