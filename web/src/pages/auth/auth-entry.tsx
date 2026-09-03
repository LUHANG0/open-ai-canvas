import { motion } from "motion/react";

import { BrandMark } from "@/components/branding/brand-mark";
import { useBranding } from "@/components/branding/branding-provider";
import { aceternityMotion } from "@/lib/aceternity-motion";

export function AuthEntry({ reducedMotion, onOpen }: { reducedMotion: boolean; onOpen: () => void }) {
    const { branding } = useBranding();

    return (
        <motion.div
            key="entry"
            className="pc-auth-entry"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reducedMotion ? 0 : 0.38, ease: aceternityMotion.easing.enter }}
        >
            <header className="pc-auth-entry-nav">
                <span className="pc-auth-entry-brand" aria-label={branding.config.identity.displayName}>
                    <BrandMark className="pc-auth-entry-logo" />
                </span>
                <button type="button" className="pc-auth-entry-login" onClick={onOpen}>
                    登录
                </button>
            </header>
            <div className="pc-auth-entry-content">
                <p className="pc-auth-entry-eyebrow">智能影像创作空间</p>
                <h1>{branding.config.auth.title}</h1>
                {branding.config.auth.description ? <p className="pc-auth-entry-description">{branding.config.auth.description}</p> : null}
                <motion.button type="button" className="pc-auth-entry-button" onClick={onOpen} whileHover={reducedMotion ? undefined : { y: -2 }} whileTap={reducedMotion ? undefined : { scale: 0.985 }}>
                    <span>进入{branding.config.identity.shortName}</span>
                    <span aria-hidden="true">→</span>
                </motion.button>
            </div>
        </motion.div>
    );
}
