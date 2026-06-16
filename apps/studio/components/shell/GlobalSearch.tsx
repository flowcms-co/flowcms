"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Combobox,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
    Dialog,
    DialogPanel,
    Transition,
    TransitionChild,
} from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type SearchItem = {
    id: string;
    label: string;
    sub?: string;
    icon: string;
    kind: "link" | "recent";
    href?: string;
};

/** Quick destinations (real routes). */
const QUICK_LINKS: SearchItem[] = [
    { id: "overview", label: "Overview", sub: "Dashboard", icon: "overview", kind: "link", href: "/" },
    { id: "content", label: "All content", sub: "Entries", icon: "document", kind: "link", href: "/content" },
    { id: "calendar", label: "Content calendar", sub: "Schedule", icon: "calendar", kind: "link", href: "/content/calendar" },
    { id: "seo", label: "SEO dashboard", sub: "FlowCMS SEO Score", icon: "chart", kind: "link", href: "/seo" },
    { id: "ai", label: "AI suite", sub: "Generate & proofread", icon: "sparkles", kind: "link", href: "/ai" },
    { id: "assets", label: "Media library", sub: "Assets", icon: "folder", kind: "link", href: "/assets" },
    { id: "settings", label: "Settings", sub: "Workspace", icon: "settings", kind: "link", href: "/settings" },
];

/** Recent searches (sample — would persist per user). */
const RECENTS: SearchItem[] = [
    { id: "r1", label: "Q3 launch checklist", icon: "clock", kind: "recent" },
    { id: "r2", label: "pricing page", icon: "clock", kind: "recent" },
    { id: "r3", label: "homepage meta description", icon: "clock", kind: "recent" },
];

const match = (item: SearchItem, q: string) =>
    `${item.label} ${item.sub ?? ""}`.toLowerCase().includes(q);

/**
 * Global search — a command palette. The top-bar field is a trigger; activating
 * it (click or ⌘/Ctrl+K) opens a centered modal that blurs + darkens the page
 * and surfaces recent searches and quick destinations. Arrow keys + Enter
 * navigate (Headless UI Combobox); Esc or a backdrop click closes.
 */
const GlobalSearch = () => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen((v) => !v);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const q = query.trim().toLowerCase();
    const recents = q ? RECENTS.filter((r) => match(r, q)) : RECENTS;
    const links = q ? QUICK_LINKS.filter((l) => match(l, q)) : QUICK_LINKS;
    const empty = recents.length === 0 && links.length === 0;

    const act = (item: SearchItem | null) => {
        if (!item) return;
        if (item.kind === "recent") {
            setQuery(item.label);
            return;
        }
        setOpen(false);
        if (item.href) router.push(item.href);
    };

    return (
        <>
            {/* Trigger — looks like the old search field, lifts on hover. */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="group relative flex h-11 grow items-center gap-3 rounded-2xl border border-transparent pl-11 pr-2.5 text-left transition-all hover:bg-white hover:border-grey-light hover:shadow-[0_0.5rem_1.5rem_rgba(227,230,236,0.6)] max-w-none md:max-w-md dark:hover:bg-dark-1 dark:hover:border-grey-light/10 dark:hover:shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.3)]"
                aria-label="Search everything"
            >
                <Icon className="pointer-events-none absolute left-4 h-5 w-5 fill-grey transition-colors group-hover:fill-primary" name="search" />
                <span className="text-body text-grey">Search everything…</span>
                <kbd className="ml-auto hidden rounded-md border border-grey-light px-1.5 py-0.5 text-[0.6875rem] font-semibold text-grey md:inline dark:border-grey-light/15">
                    ⌘K
                </kbd>
            </button>

            <Transition show={open} as={Fragment} afterLeave={() => setQuery("")}>
                <Dialog onClose={setOpen} className="relative z-[60]">
                    <TransitionChild
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" aria-hidden="true" />
                    </TransitionChild>

                    <div className="fixed inset-0 overflow-y-auto p-4 pt-[14vh]">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="mx-auto w-full max-w-xl origin-top overflow-hidden rounded-2xl bg-white shadow-[0_1.5rem_3.5rem_rgba(26,26,46,0.28)] ring-1 ring-grey-light dark:bg-dark-1 dark:ring-grey-light/10">
                                <Combobox onChange={act}>
                                    <div className="flex items-center gap-3 border-b border-grey-light px-4 dark:border-grey-light/10">
                                        <Icon className="h-5 w-5 shrink-0 fill-grey" name="search" />
                                        <ComboboxInput
                                            autoFocus
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            placeholder="Search everything…"
                                            className="h-14 w-full bg-transparent text-body text-black placeholder:text-grey outline-none dark:text-white"
                                        />
                                        <kbd className="hidden rounded-md border border-grey-light px-1.5 py-0.5 text-[0.6875rem] font-semibold text-grey sm:inline dark:border-grey-light/15">
                                            esc
                                        </kbd>
                                    </div>

                                    <ComboboxOptions static className="max-h-[22rem] overflow-y-auto p-2">
                                        {empty && (
                                            <p className="px-3 py-10 text-center text-body-sm text-grey">
                                                No matches for &ldquo;{query}&rdquo;
                                            </p>
                                        )}

                                        {recents.length > 0 && (
                                            <Section title={q ? "Recent matches" : "Recent searches"}>
                                                {recents.map((item) => (
                                                    <Row key={item.id} item={item} />
                                                ))}
                                            </Section>
                                        )}

                                        {links.length > 0 && (
                                            <Section title="Jump to">
                                                {links.map((item) => (
                                                    <Row key={item.id} item={item} />
                                                ))}
                                            </Section>
                                        )}
                                    </ComboboxOptions>
                                </Combobox>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </Dialog>
            </Transition>
        </>
    );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-1 last:mb-0">
        <p className="px-2.5 pb-1 pt-2 text-caption-2 font-semibold uppercase tracking-wide text-grey">
            {title}
        </p>
        {children}
    </div>
);

const Row = ({ item }: { item: SearchItem }) => (
    <ComboboxOption
        value={item}
        className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors data-[focus]:bg-lavender-mist dark:data-[focus]:bg-dark-3"
    >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lavender-mist text-primary group-data-[focus]:bg-white dark:bg-dark-3">
            <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name={item.icon} />
        </span>
        <span className="min-w-0 grow">
            <span className="block truncate text-body-sm font-medium text-black dark:text-white">{item.label}</span>
            {item.sub && <span className="block truncate text-caption-2 text-grey">{item.sub}</span>}
        </span>
        <Icon
            className={cn(
                "ml-auto h-4 w-4 shrink-0 opacity-0 transition-opacity group-data-[focus]:opacity-100",
                item.kind === "recent" ? "fill-grey" : "fill-primary dark:fill-lilac",
            )}
            name={item.kind === "recent" ? "arrow-left" : "arrow-right"}
        />
    </ComboboxOption>
);

export default GlobalSearch;
