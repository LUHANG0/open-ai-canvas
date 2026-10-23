import { Tag } from "antd";
import { Bell } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getAnnouncementFeed, markAnnouncementsRead } from "@/services/api/announcements";

const AnnouncementTimelineModal = lazy(() => import("@/components/ui/aceternity/announcement-timeline-modal").then((module) => ({ default: module.AnnouncementTimelineModal })));

const ANNOUNCEMENT_REFRESH_INTERVAL_MS = 5 * 60_000;
const ANNOUNCEMENT_CACHE_TTL_MS = 60_000;
const ANNOUNCEMENT_DISMISS_TODAY_PREFIX = "yingce.announcements.dismiss-today";
const ANNOUNCEMENT_DISMISS_SESSION_PREFIX = "yingce.announcements.dismiss-session";

type AnnouncementFeed = Awaited<ReturnType<typeof getAnnouncementFeed>>;

type SystemAnnouncementCenterProps = {
    userId: string;
    className?: string;
    style?: CSSProperties;
    showLabel?: boolean;
    labelClassName?: string;
    staticMotion?: boolean;
    autoOpen?: boolean;
};

export function SystemAnnouncementCenter({ userId, className, style, showLabel = false, labelClassName, autoOpen = false }: SystemAnnouncementCenterProps) {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [automaticPrompt, setAutomaticPrompt] = useState(false);
    const [dismissedFingerprint, setDismissedFingerprint] = useState("");
    const triggerRef = useRef<HTMLButtonElement>(null);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const wasOpenRef = useRef(false);
    const queryKey = ["system-announcements", userId] as const;
    const feedQuery = useQuery({
        queryKey,
        queryFn: getAnnouncementFeed,
        enabled: Boolean(userId),
        staleTime: ANNOUNCEMENT_CACHE_TTL_MS,
        refetchInterval: ANNOUNCEMENT_REFRESH_INTERVAL_MS,
        // 公告在打开面板时会显式 refetch；不把浏览器 focus 变成每个工作区实例的请求触发器。
        refetchOnWindowFocus: false,
    });
    const announcements = feedQuery.data?.announcements || [];
    const unreadCount = Math.max(0, feedQuery.data?.unreadCount || 0);
    const error = feedQuery.error instanceof Error ? feedQuery.error.message : feedQuery.error ? "读取公告失败" : "";

    useEffect(() => {
        if (wasOpenRef.current && !open) {
            if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
            returnFocusRef.current = null;
        }
        wasOpenRef.current = open;
    }, [open]);

    useEffect(() => {
        if (!autoOpen || open || !feedQuery.isSuccess || announcements.length === 0) return;
        const fingerprint = announcementFeedFingerprint(announcements);
        if (!fingerprint || fingerprint === dismissedFingerprint || announcementAutoPromptSuppressed(userId, fingerprint)) return;
        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setAutomaticPrompt(true);
        setOpen(true);
    }, [announcements, autoOpen, dismissedFingerprint, feedQuery.isSuccess, open, unreadCount, userId]);

    const openAnnouncements = async () => {
        returnFocusRef.current = triggerRef.current;
        setAutomaticPrompt(false);
        setOpen(true);
        const feed = (await feedQuery.refetch()).data;
        if (!feed?.unreadCount) return;
        try {
            const result = await markAnnouncementsRead(feed.announcements.map((announcement) => announcement.id));
            const nextUnreadCount = Math.max(0, result.unreadCount || 0);
            queryClient.setQueryData<AnnouncementFeed>(queryKey, (current) => current ? { ...current, unreadCount: nextUnreadCount } : current);
            if (nextUnreadCount > 0) void queryClient.invalidateQueries({ queryKey });
        } catch {
            // 已读状态是辅助读路径，失败时保留角标，下一次打开或轮询会继续尝试同步。
        }
    };

    const dismissAutomaticPrompt = (duration: "once" | "today") => {
        const fingerprint = announcementFeedFingerprint(announcements);
        if (fingerprint) setDismissedFingerprint(fingerprint);
        if (fingerprint) rememberAnnouncementDismissalSession(userId, fingerprint);
        if (duration === "today") rememberAnnouncementDismissalToday(userId, fingerprint);
        setAutomaticPrompt(false);
        setOpen(false);
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={className}
                style={style}
                onClick={() => void openAnnouncements()}
                aria-label={unreadCount ? `系统公告，${unreadCount} 条未读` : "系统公告"}
                aria-haspopup="dialog"
                aria-expanded={open}
                title="系统公告"
                data-icon-only={showLabel ? undefined : true}
            >
                <span className="relative shrink-0">
                    <Bell className="size-4" aria-hidden="true" />
                    {unreadCount > 0 ? <span className="absolute -right-1 -top-1 size-2 rounded-full border border-background bg-[var(--status-error)]" aria-hidden="true" /> : null}
                </span>
                {showLabel ? (
                    <span className={`min-w-0 flex-1 items-center justify-between gap-2 whitespace-nowrap ${labelClassName || ""}`}>
                        <span>系统公告</span>
                        <Tag color={unreadCount > 0 ? "gold" : undefined} className="!m-0 !min-w-6 !px-1.5 !text-center !text-[var(--fs-micro)] !font-medium !leading-[18px] tabular-nums">{announcements.length}</Tag>
                    </span>
                ) : null}
            </button>
            {open ? (
                <Suspense fallback={<span className="sr-only" role="status">正在打开系统公告</span>}>
                    <AnnouncementTimelineModal
                        open
                        announcements={announcements}
                        loading={feedQuery.isFetching}
                        error={announcements.length ? "" : error}
                        automaticPrompt={automaticPrompt}
                        onClose={() => dismissAutomaticPrompt("once")}
                        onDismissOnce={() => dismissAutomaticPrompt("once")}
                        onDismissToday={() => dismissAutomaticPrompt("today")}
                        onRetry={() => void feedQuery.refetch()}
                    />
                </Suspense>
            ) : null}
        </>
    );
}

function announcementFeedFingerprint(announcements: AnnouncementFeed["announcements"]) {
    return announcements
        .map((announcement) => `${announcement.id}:${announcement.publishedAt}`)
        .sort()
        .join("|");
}

function announcementAutoPromptSuppressed(userId: string, fingerprint: string) {
    if (hasAnnouncementDismissalSession(userId, fingerprint)) return true;
    try {
        const value = localStorage.getItem(`${ANNOUNCEMENT_DISMISS_TODAY_PREFIX}.${userId}`);
        const parsed = value ? JSON.parse(value) as { date?: string; fingerprint?: string } : null;
        return parsed?.date === localDateKey() && parsed.fingerprint === fingerprint;
    } catch {
        return false;
    }
}

function hasAnnouncementDismissalSession(userId: string, fingerprint: string) {
    try {
        return sessionStorage.getItem(`${ANNOUNCEMENT_DISMISS_SESSION_PREFIX}.${userId}`) === fingerprint;
    } catch {
        return false;
    }
}

function rememberAnnouncementDismissalSession(userId: string, fingerprint: string) {
    try {
        sessionStorage.setItem(`${ANNOUNCEMENT_DISMISS_SESSION_PREFIX}.${userId}`, fingerprint);
    } catch {
        // sessionStorage 不可用时保留页内 dismissedFingerprint 作为降级。
    }
}

function rememberAnnouncementDismissalToday(userId: string, fingerprint: string) {
    try {
        localStorage.setItem(`${ANNOUNCEMENT_DISMISS_TODAY_PREFIX}.${userId}`, JSON.stringify({ date: localDateKey(), fingerprint }));
    } catch {
        // 浏览器禁用存储时仍允许关闭弹窗，本次组件生命周期内不会重复打开。
    }
}

function localDateKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
