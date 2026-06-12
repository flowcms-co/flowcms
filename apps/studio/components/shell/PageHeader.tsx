"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useRef, type ReactNode } from "react";
import { useRole } from "@/components/providers/RoleProvider";
import { useHeaderReveal } from "@/lib/useReveal";
import ScrollableTabs from "@/components/shell/ScrollableTabs";
import type { NavTab } from "@/lib/navigation";

/**
 * Section page header: title + optional intro + role-scoped tabs.
 * Tabs are real routes (deep-linkable); the active tab is derived from the path.
 */
const PageHeader = ({
    title,
    intro,
    tabs,
    actions,
}: {
    title: string;
    intro?: string;
    tabs?: NavTab[];
    actions?: ReactNode;
}) => {
    const pathname = usePathname();
    const { role } = useRole();
    const scope = useRef<HTMLDivElement>(null);

    // Title word-wipes only when entering a new section; subtitle fades up on every
    // mount (so it animates on tab switches, where the subtitle text changes).
    useHeaderReveal(scope);

    const visibleTabs = tabs?.filter((t) => !t.roles || t.roles.includes(role));

    // Longest-matching href wins, so an index tab (e.g. "/seo") doesn't stay
    // highlighted on its own sub-routes ("/seo/auditor") alongside the real tab.
    const activeHref = (visibleTabs ?? [])
        .filter((t) => pathname === t.href || pathname.startsWith(t.href + "/"))
        .reduce((best, t) => (t.href.length > best.length ? t.href : best), "");

    return (
        <div ref={scope} className="mb-8">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="reveal-title pb-1.5 font-poppins text-[clamp(1.75rem,1.4rem_+_1.4vw,2.25rem)] leading-[1.18] font-bold tracking-[-0.02em] text-black dark:text-white">
                        {title}
                    </h1>
                    {intro && (
                        <p className="reveal-sub mt-4 text-body text-grey">{intro}</p>
                    )}
                </div>
                {actions && <div className="flex items-center gap-3">{actions}</div>}
            </div>

            {visibleTabs && visibleTabs.length > 0 && (
                <ScrollableTabs className="mt-6">
                    {visibleTabs.map((tab, i) => {
                        const active = tab.href === activeHref;
                        const newGroup = !!tab.group && tab.group !== visibleTabs[i - 1]?.group;
                        return (
                            <Fragment key={tab.href}>
                                {newGroup && (
                                    <span className="shrink-0 pl-2 pr-0.5 text-caption-2 font-semibold uppercase tracking-wide text-grey/70 first:pl-0">
                                        {tab.group}
                                    </span>
                                )}
                                <Link
                                    href={tab.href}
                                    data-active={active ? "true" : undefined}
                                    className={`shrink-0 px-4 py-2 rounded-md text-menu transition-colors ${
                                        active
                                            ? "bg-primary text-white shadow-glow"
                                            : "text-grey hover:text-primary hover:bg-lavender-mist dark:hover:bg-dark-1"
                                    }`}
                                >
                                    {tab.label}
                                </Link>
                            </Fragment>
                        );
                    })}
                </ScrollableTabs>
            )}
        </div>
    );
};

export default PageHeader;
