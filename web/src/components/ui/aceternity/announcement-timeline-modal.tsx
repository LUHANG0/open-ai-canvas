import { Button, Image as AntImage, Modal } from "antd";
import { Bell, BellOff, CircleAlert, Info, Pin, ShieldAlert, Wrench } from "lucide-react";
import { currentLocale, translate } from "@/i18n";
import { useTranslation } from "react-i18next";

import { AnnouncementContent } from "@/components/ui/announcement-content";
import { announcementImageUrl, type AnnouncementLevel, type SystemAnnouncement } from "@/services/api/announcements";

type AnnouncementTimelineModalProps = {
    open: boolean;
    announcements: SystemAnnouncement[];
    loading?: boolean;
    error?: string;
    automaticPrompt?: boolean;
    onClose: () => void;
    onDismissOnce?: () => void;
    onDismissToday?: () => void;
    onRetry?: () => void;
};

/** label 为 account.ui.announcements.levels 下的键名，渲染时翻译。 */
const levelMeta: Record<AnnouncementLevel, { label: string; dot: string; icon: typeof Info }> = {
    info: { label: "info", dot: "bg-sky-500", icon: Info },
    success: { label: "success", dot: "bg-emerald-500", icon: Wrench },
    warning: { label: "warning", dot: "bg-amber-500", icon: CircleAlert },
    critical: { label: "critical", dot: "bg-red-500", icon: ShieldAlert },
};

export function AnnouncementTimelineModal({ open, announcements, loading = false, error = "", automaticPrompt = false, onClose, onDismissOnce, onDismissToday, onRetry }: AnnouncementTimelineModalProps) {
    const { t } = useTranslation();
    return (
        <Modal
            rootClassName="system-announcement-modal workspace-utility-overlay"
            open={open}
            width={960}
            centered
            footer={automaticPrompt ? (
                <div className="flex flex-wrap justify-end gap-2">
                    <Button onClick={onDismissToday}>{t("account.ui.announcements.dismissToday")}</Button>
                    <Button type="primary" onClick={onDismissOnce}>{t("account.ui.announcements.dismissOnce")}</Button>
                </div>
            ) : null}
            onCancel={onClose}
            focusTriggerAfterClose
            title={
                <div className="flex min-w-0 items-center gap-3 pr-8">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-muted/45 text-foreground">
                        <Bell className="size-4.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <div className="text-lg font-semibold tracking-normal text-foreground">系统公告</div>
                        <div className="mt-0.5 text-[13px] font-normal text-[var(--user-ink-muted)]">{loading ? "正在读取当前公告" : error ? "暂时无法读取公告" : announcements.length ? `${announcements.length} 条当前公告` : "当前没有进行中的公告"}</div>
                    </div>
                </div>
            }
            styles={{ body: { paddingTop: 8, maxHeight: "min(72vh, 720px)", overflowY: "auto", overscrollBehavior: "contain" } }}
        >
            <div aria-busy={loading}>
                {loading ? (
                    <div role="status" className="grid min-h-60 place-items-center">
                        <div className="flex flex-col items-center gap-3 text-sm text-[var(--user-ink-muted)]">
                            <span aria-hidden="true" className="size-7 animate-spin rounded-full border-2 border-foreground/15 border-t-foreground/70 motion-reduce:animate-none" />
                            正在读取公告
                        </div>
                    </div>
                ) : error ? (
                    <div className="grid min-h-60 place-items-center text-center" role="alert">
                        <div>
                            <CircleAlert className="mx-auto size-7 text-[var(--status-error)]" aria-hidden="true" />
                            <p className="mt-3 text-sm font-medium text-foreground">公告读取失败</p>
                            <p className="mt-1 max-w-sm break-words text-[13px] leading-5 text-[var(--user-ink-muted)]">{error}</p>
                            {onRetry ? <button type="button" className="mt-4 h-8 rounded-md border border-border px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-muted" onClick={onRetry}>重新加载</button> : null}
                        </div>
                    </div>
                ) : announcements.length ? (
                    <div className="py-3 sm:px-2">
                        {announcements.map((announcement, index) => (
                            <AnnouncementTimelineItem key={announcement.id} announcement={announcement} last={index === announcements.length - 1} />
                        ))}
                    </div>
                ) : (
                    <div className="grid min-h-60 place-items-center text-center" role="status">
                        <div>
                            <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-muted/40 text-[var(--user-ink-muted)]"><BellOff className="size-5" aria-hidden="true" /></span>
                            <p className="mt-3 text-sm font-medium text-foreground">暂无系统公告</p>
                            <p className="mt-1 text-[13px] text-[var(--user-ink-muted)]">有新的服务动态时会在这里展示</p>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

function AnnouncementTimelineItem({ announcement, last }: { announcement: SystemAnnouncement; last: boolean }) {
    const meta = levelMeta[announcement.level] || levelMeta.info;
    const Icon = meta.icon;
    return (
        <article
            className="relative grid grid-cols-[26px_minmax(0,1fr)] gap-3 pb-7 last:pb-2 sm:grid-cols-[32px_minmax(0,1fr)] sm:gap-4"
        >
            <div className="relative flex justify-center pt-2" aria-hidden>
                {!last ? <span className="absolute left-1/2 top-5 h-[calc(100%+4px)] w-px -translate-x-1/2 bg-border" /> : null}
                <span className={`relative z-10 size-3.5 rounded-full border-[3px] border-background ${meta.dot}`} />
            </div>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="break-words text-[var(--fs-body-lg)] font-semibold leading-6 tracking-normal text-foreground">{announcement.title}</h3>
                    <span className="inline-flex items-center gap-1 text-[var(--fs-caption)] font-medium text-[var(--user-ink-muted)]"><Icon className="size-3" aria-hidden="true" />{meta.label}</span>
                    {announcement.pinned ? <span className="inline-flex items-center gap-1 text-[var(--fs-caption)] font-medium text-[var(--user-ink-muted)]"><Pin className="size-3" aria-hidden="true" />置顶</span> : null}
                </div>
                {announcement.imageUrl ? <AntImage src={announcementImageUrl(announcement)} alt={`${announcement.title} 配图`} preview className="mt-3 max-h-36 w-56 max-w-full rounded-lg border border-border/70 bg-muted/20 object-contain p-1" /> : null}
                {announcement.content ? <AnnouncementContent content={announcement.content} className="mt-1 text-sm leading-6 text-foreground/75" /> : null}
                <time dateTime={announcement.publishedAt} className="mt-2 block text-xs tabular-nums text-[var(--user-ink-muted)]">{relativeTime(announcement.publishedAt)} · {formatDateTime(announcement.publishedAt)}</time>
            </div>
        </article>
    );
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat(currentLocale(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replaceAll("/", "-");
}

function relativeTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return translate("time.justNow");
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return translate("time.justNow");
    if (seconds < 3600) return translate("time.minutesAgo", { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return translate("time.hoursAgo", { count: Math.floor(seconds / 3600) });
    if (seconds < 86400 * 7) return translate("time.daysAgo", { count: Math.floor(seconds / 86400) });
    return translate("account.ui.announcements.weeksAgo", { count: Math.floor(seconds / (86400 * 7)) });
}
