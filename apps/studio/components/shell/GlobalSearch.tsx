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
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type SearchItem = {
    id: string;
    label: string;
    sub?: string;
    icon: string;
    href: string;
};

type ApiEntry = { id: string; title: string; status: string; contentType?: { name?: string } | null };
type ApiAsset = { id: string; name: string; type: string };

/** Quick destinations (real routes), shown when the box is empty + matched while typing. */
const QUICK_LINKS: SearchItem[] = [
    { id: "overview", label: "Overview", sub: "Dashboard", icon: "overview", href: "/" },
    { id: "content", label: "All content", sub: "Entries", icon: "document", href: "/content" },
    { id: "calendar", label: "Content calendar", sub: "Schedule", icon: "calendar", href: "/content/calendar" },
    { id: "seo", label: "SEO dashboard", sub: "FlowCMS SEO Score", icon: "chart", href: "/seo" },
    { id: "ai", label: "AI suite", sub: "Generate & proofread", icon: "sparkles", href: "/ai" },
    { id: "assets", label: "Media library", sub: "Assets", icon: "folder", href: "/assets" },
    { id: "settings", label: "Settings", sub: "Workspace", icon: "settings", href: "/settings" },
];

const matchLink = (item: SearchItem, q: string) => `${item.label} ${item.sub ?? ""}`.toLowerCase().includes(q);

/**
 * Global search — a command palette. The top-bar field is a trigger; ⌘/Ctrl+K or
 * a click opens a centered modal. Typing queries the workspace's real content
 * entries and media (debounced) and surfaces matching quick destinations; arrow
 * keys + Enter navigate (Headless UI Combobox), Esc closes.
 */
const GlobalSearch = () => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [content, setContent] = useState<SearchItem[]>([]);
    const [media, setMedia] = useState<SearchItem[]>([]);
    const [loading, setLoading] = useState(false);

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

    const q = query.trim();

    // Live search: query content + media as you type (debounced). Needs 2+ chars.
    useEffect(() => {
        if (!open || q.length < 2) {
            /* eslint-disable react-hooks/set-state-in-effect */
            setContent([]);
            setMedia([]);
            setLoading(false);
            /* eslint-enable react-hooks/set-state-in-effect */
            return;
        }
        let cancel = false;
        setLoading(true);
        const t = setTimeout(async () => {
            const [entries, assets] = await Promise.all([
                api<ApiEntry[]>(`/entries?q=${encodeURIComponent(q)}`).catch(() => [] as ApiEntry[]),
                api<ApiAsset[]>(`/assets?q=${encodeURIComponent(q)}&limit=8`).catch(() => [] as ApiAsset[]),
            ]);
            if (cancel) return;
            setContent(
                entries.slice(0, 8).map((e) => ({
                    id: `e-${e.id}`,
                    label: e.title || "Untitled",
                    sub: [e.contentType?.name, (e.status ?? "").toLowerCase()].filter(Boolean).join(" · "),
                    icon: "document",
                    href: `/content/editor?id=${e.id}`,
                })),
            );
            setMedia(
                assets.slice(0, 6).map((a) => ({
                    id: `a-${a.id}`,
                    label: a.name,
                    sub: a.type,
                    icon: a.type === "image" ? "image" : "folder",
                    href: `/assets?q=${encodeURIComponent(a.name)}`,
                })),
            );
            setLoading(false);
        }, 250);
        return () => {
            cancel = true;
            clearTimeout(t);
        };
    }, [q, open]);

    const lcq = q.toLowerCase();
    const links = lcq ? QUICK_LINKS.filter((l) => matchLink(l, lcq)) : QUICK_LINKS;
    const empty = !loading && lcq.length >= 2 && content.length === 0 && media.length === 0 && links.length === 0;

    const act = (item: SearchItem | null) => {
        if (!item) return;
        setOpen(false);
        router.push(item.href);
    };

    return (
        <>
            {/* Trigger — a compact icon button on mobile, a full search field on desktop. */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="group relative flex h-11 w-11 shrink-0 items-center justify-center gap-3 rounded-2xl border border-transparent text-left transition-all hover:bg-white hover:border-grey-light hover:shadow-[0_0.5rem_1.5rem_rgba(227,230,236,0.6)] md:w-auto md:grow md:max-w-md md:justify-start md:pl-11 md:pr-2.5 dark:bg-dark-1 dark:hover:bg-dark-1 dark:hover:border-grey-light/10 dark:hover:shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.3)] md:dark:bg-transparent"
                aria-label="Search everything"
            >
                <Icon className="h-5 w-5 fill-grey transition-colors group-hover:fill-primary md:pointer-events-none md:absolute md:left-4" name="search" />
                <span className="hidden text-body text-grey md:inline">Search everything…</span>
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
                                        <Icon className={cn("h-5 w-5 shrink-0", loading ? "animate-spin fill-primary" : "fill-grey")} name={loading ? "refresh" : "search"} />
                                        <ComboboxInput
                                            autoFocus
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            placeholder="Search content, media, pages…"
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

                                        {content.length > 0 && (
                                            <Section title="Content">
                                                {content.map((item) => (
                                                    <Row key={item.id} item={item} />
                                                ))}
                                            </Section>
                                        )}

                                        {media.length > 0 && (
                                            <Section title="Media">
                                                {media.map((item) => (
                                                    <Row key={item.id} item={item} />
                                                ))}
                                            </Section>
                                        )}

                                        {links.length > 0 && (
                                            <Section title={lcq ? "Jump to" : "Quick links"}>
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
            {item.sub && <span className="block truncate text-caption-2 capitalize text-grey">{item.sub}</span>}
        </span>
        <Icon className="ml-auto h-4 w-4 shrink-0 fill-primary opacity-0 transition-opacity group-data-[focus]:opacity-100 dark:fill-lilac" name="arrow-right" />
    </ComboboxOption>
);

export default GlobalSearch;
