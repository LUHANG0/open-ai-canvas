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
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: reducedMotion ? 0 : 0.38, ease: aceternityMotion.easing.enter }}
        >
            <div className="pc-auth-stars" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} />
                ))}
            </div>
            <header className="pc-auth-entry-nav">
                <span className="pc-auth-entry-brand" aria-label={branding.config.identity.displayName}>
                    <span className="pc-auth-entry-brand-mark">
                        <BrandMark className="pc-auth-entry-logo" />
                    </span>
                    <strong>{branding.config.identity.shortName}</strong>
                </span>
                <button type="button" className="pc-auth-entry-login" onClick={onOpen}>
                    登录
                </button>
            </header>
            <div className="pc-auth-entry-content">
                <div className="pc-auth-entry-ornament" aria-hidden="true">
                    <span />
                    <b>✦</b>
                    <span />
                </div>
                <h1>{branding.config.auth.title}</h1>
                {branding.config.auth.description ? <p className="pc-auth-entry-description">{branding.config.auth.description}</p> : null}
                <motion.button type="button" className="pc-auth-entry-button" onClick={onOpen} whileHover={reducedMotion ? undefined : { y: -1 }} whileTap={reducedMotion ? undefined : { scale: 0.985 }}>
                    <span>进入{branding.config.identity.shortName}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 12h15" />
                        <path d="M13.5 5.5 20 12l-6.5 6.5" />
                    </svg>
                </motion.button>
            </div>
        </motion.div>
    );
}
