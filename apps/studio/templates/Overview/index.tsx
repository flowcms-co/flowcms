"use client";

import { useRef } from "react";
import Image from "next/image";
import { useRole } from "@/components/providers/RoleProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { illustrationSrc, legacyIllustrationSrc, resolveCharacter, withAvatarFallback } from "@/lib/avatar";
import { useHeaderReveal } from "@/lib/useReveal";
import SharedOverview from "@/templates/Overview/SharedOverview";
import EditorOverview from "@/templates/Overview/EditorOverview";
import SeoOverview from "@/templates/Overview/SeoOverview";

/** Time-of-day greeting + matching emoji (computed in the browser). Bold, clearly
 *  legible glyphs at small size: sun → partly-sunny → sunset → moon. */
function greetingFor(d: Date): { hello: string; emoji: string; label: string } {
    const h = d.getHours();
    if (h < 12) return { hello: "Good morning", emoji: "☀️", label: "morning sun" };
    if (h < 17) return { hello: "Good afternoon", emoji: "⛅", label: "afternoon sun behind cloud" };
    if (h < 22) return { hello: "Good evening", emoji: "🌙", label: "evening moon" };
    return { hello: "Working late", emoji: "⭐", label: "late night star" };
}

/**
 * Overview entry. The greeting + hero illustration are shared; the dashboard body
 * adapts per role:
 *   - editor → task-focused (EditorOverview)
 *   - seo    → SEO-focused (SeoOverview)
 *   - super / admin → full shared dashboard (SharedOverview)
 */
const Overview = () => {
    const { role, meta } = useRole();
    const { user } = useAuth();
    const firstName = meta.user.name.split(" ")[0];
    // The dashboard figure matches the avatar the user picked (illustrations are
    // numbered 1-14 to mirror the avatar pool); falls back to a stable pick.
    const heroKey = resolveCharacter(user?.avatarStyle, user?.id || user?.email);
    const heroSrc = illustrationSrc(heroKey);
    // Rendered with suppressHydrationWarning: prerendered at build time but
    // recomputed in the browser, so the two strings can legitimately differ.
    const now = new Date();
    const { hello, emoji, label: emojiLabel } = greetingFor(now);
    const today = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    const scope = useRef<HTMLDivElement>(null);
    useHeaderReveal(scope);

    return (
        <div className="flex flex-col gap-6">
            <div ref={scope} className="flex items-start justify-between gap-6 pt-2 sm:pt-4">
                <div className="min-w-0">
                    <p className="reveal-sub text-h6 font-medium text-grey">
                        <span suppressHydrationWarning>{hello}</span>, {firstName}{" "}
                        <span role="img" aria-label={emojiLabel} suppressHydrationWarning>{emoji}</span>
                    </p>
                    <h1 className="reveal-title mt-3.5 pb-1.5 font-poppins text-[clamp(1.75rem,1.4rem_+_1.4vw,2.25rem)] leading-[1.18] font-bold tracking-[-0.02em] text-black dark:text-white">
                        {role === "seo" ? "Your search command center" : role === "editor" ? "Let’s create something great today" : "Everything in motion"}
                    </h1>
                    <p className="reveal-sub mt-4 text-body text-grey">
                        <span suppressHydrationWarning>{today}</span> &middot;{" "}
                        {role === "seo"
                            ? "Here’s how search, content and rankings are trending."
                            : role === "editor"
                              ? "Here’s your work, your goal and your wins."
                              : "Here’s what’s happening across your operations."}
                    </p>
                </div>

                {/* Hero illustration: the figure matching the user's chosen avatar.
                    Brand-independent (a raster character, not tinted by the accent),
                    so it never recolors with white-label branding. Decorative;
                    hidden on small screens. */}
                <Image
                    key={heroSrc}
                    src={heroSrc}
                    alt=""
                    width={340}
                    height={200}
                    priority
                    unoptimized
                    onError={(e) => withAvatarFallback(e, legacyIllustrationSrc(heroKey))}
                    className="reveal-pop hidden h-auto w-[clamp(15rem,22vw,21rem)] shrink-0 select-none md:block"
                />
            </div>

            {role === "editor" ? <EditorOverview /> : role === "seo" ? <SeoOverview /> : <SharedOverview />}
        </div>
    );
};

export default Overview;
