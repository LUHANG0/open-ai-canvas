import { ScrollText } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { updateAnnouncementVersion } from "@/lib/update-announcement";
import { UpdateAnnouncementContent } from "./update-announcement-content";

export function AppChangelogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const updates = useAppearanceStore((state) => state.appearance.updates);
    const custom = Boolean(updates?.enabled);
    const version = updateAnnouncementVersion(updates, __APP_VERSION__);

    return (
        <AppModal
            rootClassName="app-spatial-modal app-changelog-modal workspace-utility-overlay"
            title={
                <div className="app-changelog-heading">
                    <span className="app-changelog-heading-icon">
                        <ScrollText className="size-4" />
                    </span>
                    <div className="app-changelog-heading-copy">
                        <div className="app-changelog-heading-title">{custom ? "更新公告" : "更新日志"}</div>
                        <div className="app-changelog-heading-description">{custom ? "按版本查看本站发布的更新与功能介绍" : "按版本查看产品能力、交互与稳定性变化"}</div>
                    </div>
                    <span className="app-changelog-current-version">当前版本 {version}</span>
                </div>
            }
            open={open}
            width={820}
            footer={null}
            centered
            onCancel={onClose}
            focusTriggerAfterClose
        >
            <div className="app-changelog-scroll thin-scrollbar" role="region" aria-label={custom ? "更新公告内容" : "更新日志内容"} tabIndex={0}>
                {custom && updates ? (
                    updates.releases.length ? <UpdateAnnouncementContent value={updates} /> : <p className="app-changelog-paragraph" role="status">暂无更新公告，后续发布的更新会展示在这里。</p>
                ) : __APP_CHANGELOG__.trim() ? (
                    <ReactMarkdown
                        components={{
                            h1: () => null,
                            h2: ({ children }) => {
                                const label = String(children);
                                const latest = label === "Unreleased";

                                return (
                                    <h3 className={`app-changelog-section-heading${latest ? " is-latest" : ""}`}>
                                        <span className="app-changelog-section-marker" aria-hidden="true" />
                                        <span>{latest ? "开发中" : label}</span>
                                        {latest ? <span className="app-changelog-latest-badge">最新</span> : null}
                                    </h3>
                                );
                            },
                            ul: ({ children }) => <ul className="app-changelog-list">{children}</ul>,
                            li: ({ children }) => <li>{children}</li>,
                            p: ({ children }) => <p className="app-changelog-paragraph">{children}</p>,
                            code: ({ children }) => <code className="app-changelog-code">{children}</code>,
                        }}
                    >
                        {__APP_CHANGELOG__}
                    </ReactMarkdown>
                ) : <p className="app-changelog-paragraph" role="status">暂无更新日志，后续版本变化会展示在这里。</p>}
            </div>
        </AppModal>
    );
}
