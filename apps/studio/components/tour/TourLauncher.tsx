"use client";

import { Popover, Transition } from "@headlessui/react";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import Switch from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { useRole } from "@/components/providers/RoleProvider";
import type { TourRequirementKey } from "@/lib/tour";
import { useTour } from "@/components/tour/TourProvider";

/** The "make everything work" checklist: the integrations features wait on. */
const SETUP: { key: TourRequirementKey; label: string; desc: string; href: string }[] = [
    { key: "email", label: "Email (SMTP)", desc: "Invites, resets and alerts", href: "/settings/integrations?tab=email" },
    { key: "ai", label: "AI provider", desc: "Generator, rewrite, alt text", href: "/settings/integrations?tab=ai" },
    { key: "gsc", label: "Search Console", desc: "Keywords and SEO data", href: "/settings/integrations?tab=analytics" },
    { key: "ga4", label: "Google Analytics 4", desc: "Traffic and AI referrals", href: "/settings/integrations?tab=analytics" },
];

/**
 * The tour compass in the top bar: replay any screen's chapter, see overall
 * progress, and (for managers) a live setup checklist showing which
 * integrations still need connecting for everything to work. An orange dot on
 * the button nudges until every chapter has been seen.
 */
const TourLauncher = () => {
    const { chapters, progress, connected, connLoading, play, setMuted, restart } = useTour();
    const { role } = useRole();
    const canManage = role === "super" || role === "admin";

    const done = chapters.filter((c) => progress.chapters[c.id] === "done").length;
    const seen = chapters.filter((c) => progress.chapters[c.id]).length;
    const pct = chapters.length ? Math.round((done / chapters.length) * 100) : 0;

    return (
        <Popover className="relative">
            <Popover.Button
                className="relative btn-circle dark:bg-dark-1"
                aria-label="Guided tour"
                data-tour="topbar-tour"
            >
                <Icon className="fill-black dark:fill-white" name="compass" />
                {seen < chapters.length && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-orange ring-2 ring-white dark:ring-dark-1" />
                )}
            </Popover.Button>
            <Transition
                enter="transition duration-100 ease-out"
                enterFrom="opacity-0 scale-95 -translate-y-1"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="transition duration-75 ease-in"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
            >
                <Popover.Panel className="absolute right-0 z-3 mt-3 w-[22rem] rounded-3xl bg-surface p-5 shadow-[0_1.25rem_2.5rem_rgba(26,26,46,0.16)] focus:outline-none dark:bg-dark-1 dark:shadow-[0_1.25rem_2.5rem_rgba(0,0,0,0.5)]">
                    {({ close }) => (
                        <>
                            <div className="flex items-center justify-between">
                                <span className="text-h6 text-black dark:text-white">Guided tour</span>
                                <span className="text-caption-2 text-grey">
                                    {done}/{chapters.length} explored
                                </span>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-lavender-mist dark:bg-dark-3">
                                <div
                                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>

                            {/* Chapters */}
                            <div className="-mx-2 mt-3 flex max-h-[19rem] flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-grey-light dark:scrollbar-thumb-grey-light/20">
                                {chapters.map((c) => {
                                    const state = progress.chapters[c.id];
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                close();
                                                play(c.id);
                                            }}
                                            className="group flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-lavender-mist/60 dark:hover:bg-dark-3/40"
                                        >
                                            <span
                                                className={cn(
                                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                                    state === "done"
                                                        ? "bg-success/15"
                                                        : "bg-lavender-mist dark:bg-dark-3",
                                                )}
                                            >
                                                <Icon
                                                    name={state === "done" ? "check" : c.icon}
                                                    className={cn(
                                                        "h-4 w-4",
                                                        state === "done" ? "fill-success" : "fill-primary dark:fill-lilac",
                                                    )}
                                                />
                                            </span>
                                            <span className="min-w-0 grow">
                                                <span className="block truncate text-body-sm font-semibold text-black dark:text-white">
                                                    {c.title}
                                                </span>
                                                <span className="block truncate text-caption-2 text-grey">{c.blurb}</span>
                                            </span>
                                            <Icon
                                                name="arrow-right"
                                                className="h-4 w-4 shrink-0 fill-grey opacity-0 transition-opacity group-hover:opacity-100"
                                            />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Setup checklist — managers only (they can connect things). */}
                            {canManage && (
                                <>
                                    <div className="my-4 h-px bg-grey-light/70 dark:bg-grey-light/10" />
                                    <p className="text-caption-1 font-semibold text-black dark:text-white">
                                        Make everything work
                                    </p>
                                    <div className="mt-2 flex flex-col gap-1">
                                        {SETUP.map((item) => {
                                            const on = connected[item.key];
                                            return (
                                                <div key={item.key} className="flex items-center gap-2.5 py-1">
                                                    <span
                                                        className={cn(
                                                            "h-2 w-2 shrink-0 rounded-full",
                                                            connLoading ? "bg-grey-light" : on ? "bg-success" : "bg-warning",
                                                        )}
                                                    />
                                                    <span className="min-w-0 grow">
                                                        <span className="block text-caption-1 text-black dark:text-white">
                                                            {item.label}
                                                        </span>
                                                        <span className="block truncate text-caption-2 text-grey">{item.desc}</span>
                                                    </span>
                                                    {!connLoading && !on && (
                                                        <Link
                                                            href={item.href}
                                                            onClick={() => close()}
                                                            className="shrink-0 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70"
                                                        >
                                                            Connect
                                                        </Link>
                                                    )}
                                                    {!connLoading && on && (
                                                        <span className="shrink-0 text-caption-2 font-semibold text-success">
                                                            Connected
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            <div className="my-4 h-px bg-grey-light/70 dark:bg-grey-light/10" />
                            <div className="flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 text-caption-2 text-grey">
                                    <Switch
                                        checked={!progress.muted}
                                        onChange={(on) => setMuted(!on)}
                                        aria-label="Auto-play chapters on new screens"
                                    />
                                    Auto-play on new screens
                                </label>
                                <button
                                    type="button"
                                    onClick={restart}
                                    className="text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70"
                                >
                                    Restart tour
                                </button>
                            </div>
                        </>
                    )}
                </Popover.Panel>
            </Transition>
        </Popover>
    );
};

export default TourLauncher;
