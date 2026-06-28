"use client";

import Link from "next/link";
import { Menu, Transition } from "@headlessui/react";
import { useTheme } from "next-themes";
import Icon from "@/components/ui/Icon";
import GlobalSearch from "@/components/shell/GlobalSearch";
import ProfileMenu from "@/components/shell/ProfileMenu";
import { metaFor, relTime, useNotifications } from "@/lib/useNotifications";

const Topbar = ({ onMenu }: { onMenu: () => void }) => {
    const { items, unread, markRead, markAll } = useNotifications();
    const { resolvedTheme, setTheme } = useTheme();
    const recent = (items ?? []).slice(0, 5);

    return (
        <header className="pt-safe sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-grey-light/70 bg-bg/80 px-4 backdrop-blur-xl lg:static lg:h-20 lg:gap-4 lg:border-b-0 lg:bg-transparent lg:px-6 lg:backdrop-blur-none dark:border-grey-light/10 dark:bg-dark-2/80 lg:dark:bg-transparent">
            {/* Mobile menu (opens the sidebar drawer). Desktop collapse lives on
                the sidebar logo icon. Header is fixed on mobile, static on desktop. */}
            <button
                type="button"
                aria-label="Open menu"
                onClick={onMenu}
                className="flex lg:hidden btn-circle h-11 w-11 dark:bg-dark-1"
            >
                <Icon className="fill-black dark:fill-white" name="menu-collapse" />
            </button>

            {/* Global search — a trigger that opens the command palette. */}
            <GlobalSearch />

            <div className="flex items-center gap-3 ml-auto">
                {/* New content */}
                <Link
                    href="/content/editor"
                    className="btn-primary h-11 px-3 gap-2 md:px-4"
                    aria-label="New content"
                >
                    <Icon className="w-5 h-5 fill-white" name="plus" />
                    <span className="hidden md:inline">New Content</span>
                </Link>

                {/* Theme toggle */}
                <button
                    type="button"
                    aria-label="Toggle color theme"
                    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                    className="btn-circle dark:bg-dark-1"
                >
                    <Icon className="fill-black dark:hidden" name="sun" />
                    <Icon className="hidden fill-lilac dark:inline-flex" name="moon" />
                </button>

                {/* Notifications */}
                <Menu as="div" className="relative">
                    <Menu.Button className="relative btn-circle dark:bg-dark-1" aria-label="Notifications">
                        <Icon className="fill-black dark:fill-white" name="bell" />
                        {unread > 0 && (
                            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-orange ring-2 ring-white dark:ring-dark-1" />
                        )}
                    </Menu.Button>
                    <Transition
                        enter="transition duration-100 ease-out"
                        enterFrom="opacity-0 scale-95 -translate-y-1"
                        enterTo="opacity-100 scale-100 translate-y-0"
                        leave="transition duration-75 ease-in"
                        leaveFrom="opacity-100 scale-100"
                        leaveTo="opacity-0 scale-95"
                    >
                        {/* Notification dropdown — Unity style: avatar + colored
                            status badge, name/action/target, black "see all" button. */}
                        <Menu.Items className="absolute right-0 z-3 mt-3 w-[22rem] p-6 rounded-3xl bg-surface shadow-[0_1.25rem_2.5rem_rgba(26,26,46,0.16)] focus:outline-none dark:bg-dark-1 dark:shadow-[0_1.25rem_2.5rem_rgba(0,0,0,0.5)] md:w-80 md:p-4">
                            <div className="mb-5 flex items-center justify-between">
                                <span className="text-h6 text-black dark:text-white">Notifications</span>
                                {unread > 0 && (
                                    <button type="button" onClick={() => void markAll()} className="text-caption-2 text-primary transition-opacity hover:opacity-70">
                                        Mark all read
                                    </button>
                                )}
                            </div>
                            <div className="-mx-3">
                                {recent.length === 0 ? (
                                    <p className="px-3 py-8 text-center text-caption-2 text-grey">You&rsquo;re all caught up.</p>
                                ) : (
                                    recent.map((n) => {
                                        const m = metaFor(n.type);
                                        return (
                                            <Link
                                                key={n.id}
                                                href={n.href || "/notifications"}
                                                onClick={() => !n.read && void markRead(n.id)}
                                                className={`group flex w-full items-start gap-3 px-3 py-3 rounded-2xl text-left transition-colors hover:bg-primary ${n.read ? "opacity-60" : ""}`}
                                            >
                                                <span className="flex items-center justify-center w-9 h-9 rounded-full shrink-0" style={{ backgroundColor: `${m.color}22` }}>
                                                    <Icon className="w-4 h-4" name={m.icon} fill={m.color} />
                                                </span>
                                                <span className="grow min-w-0">
                                                    <span className="flex items-center justify-between gap-2">
                                                        <span className="truncate text-title text-black group-hover:text-white dark:text-white">{n.title}</span>
                                                        <span className="shrink-0 text-caption-2 text-text-mute group-hover:text-white/80">{relTime(n.createdAt)}</span>
                                                    </span>
                                                    {n.body && <span className="block truncate text-caption-2 text-grey group-hover:text-white/90">{n.body}</span>}
                                                </span>
                                            </Link>
                                        );
                                    })
                                )}
                            </div>
                            <Link href="/notifications" className="btn-primary w-full mt-5">
                                See all activity
                            </Link>
                        </Menu.Items>
                    </Transition>
                </Menu>

                {/* Profile / role switcher (super) or static identity (others) */}
                <ProfileMenu />
            </div>
        </header>
    );
};

export default Topbar;
