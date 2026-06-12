"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Menu, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Pagination from "@/components/ui/Pagination";
import { api } from "@/lib/api";
import { checkGrammar, readabilityScore, checkOriginality, type CorpusPage, type TextIssue, type OriginalityNote } from "@/lib/textTools";
import { cn } from "@/lib/cn";

type Entry = { id: string; title: string; slug?: string | null; status: string; updatedAt?: string; data: Record<string, unknown> | null; contentType?: { name: string } };
type IssueKind = "all" | "grammar" | "duplicates" | "readability";
type Kind = "grammar" | "duplicates" | "readability";
type PageResult = {
    id: string;
    title: string;
    slug: string;
    type: string;
    updatedAt: number;
    grammar: TextIssue[];
    duplicates: OriginalityNote[];
    readability: number | null; // the Flesch score when it's below the floor, else null
    readSentence: string; // the longest/hardest sentence (the readability fix target)
};

/** A single flagged page+issue row in the list. */
type Item = {
    key: string;
    id: string;
    title: string;
    slug: string;
    updatedAt: number;
    kind: Kind;
    issues: number; // for sorting + the grammar count
    detail: string;
    href: string;
};

/** Scan the most recent published pages so the audit stays responsive. */
const SCAN_LIMIT = 100;
const READABILITY_FLOOR = 60;
const PAGE_SIZE = 10;

const plainBody = (e: Entry) =>
    String((e.data as { body?: string } | null)?.body ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const normWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/** Map a normalized duplicate shingle back to the original-cased phrase. */
function originalPhrase(body: string, normalized: string): string {
    const target = normalized.split(" ").filter(Boolean);
    if (!target.length) return normalized;
    const words = body.split(/\s+/);
    const norm = words.map(normWord);
    for (let i = 0; i + target.length <= norm.length; i++) {
        let ok = true;
        for (let j = 0; j < target.length; j++) {
            if (norm[i + j] !== target[j]) {
                ok = false;
                break;
            }
        }
        if (ok) return words.slice(i, i + target.length).join(" ");
    }
    return normalized;
}

/** The longest sentence on the page — the usual readability culprit. */
function longSentence(text: string): string {
    const parts = text
        .split(/(?<=[.!?])\s+/)
        .map((p) => p.trim())
        .filter((p) => p.split(/\s+/).length >= 8);
    if (!parts.length) return "";
    return parts.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length)[0];
}

const gradeOf = (score: number) => (score < 30 ? "Very difficult" : score < 50 ? "Difficult" : score < 60 ? "Fair" : "Good");

/** Parse "...page “Title” (NN% of phrases match)." → distinct pages + max similarity. */
function dupSummary(notes: OriginalityNote[]): { pages: number; similarity: number } {
    const pages = new Set<string>();
    let sim = 0;
    for (const n of notes) {
        const m = n.why.match(/[“"](.+?)[”"]\s*\((\d+)%/);
        if (m) {
            pages.add(m[1]);
            sim = Math.max(sim, Number(m[2]));
        }
    }
    return { pages: pages.size, similarity: sim };
}

const FILTERS: { id: IssueKind; label: string }[] = [
    { id: "all", label: "All issues" },
    { id: "grammar", label: "Grammar & spelling" },
    { id: "duplicates", label: "Duplicate passages" },
    { id: "readability", label: "Readability" },
];

const SORTS = [
    { value: "newest", label: "Newest" },
    { value: "issues", label: "Most issues" },
    { value: "az", label: "A to Z" },
];

/* Per-kind visual identity (brand palette). */
const KIND: Record<Kind, { label: string; color: string; pill: boolean }> = {
    grammar: { label: "Grammar", color: "#E0473E", pill: false },
    readability: { label: "Readability", color: "#C77E00", pill: false },
    duplicates: { label: "Duplicate content", color: "#6C5CE7", pill: true },
};

const PATHS = {
    pen: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
    copy: "M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    chevronRight: "M9 18l6-6-6-6",
    dots: "M12 5h.01M12 12h.01M12 19h.01",
    sparkle: "M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z",
    wand: "M15 4V2M9.5 8.5 3 15l6 6 6.5-6.5M15 9l6-6M14 5l5 5",
    refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15",
};

const Stroke = ({ d, color, className }: { d: string; color?: string; className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);

/** The tinted leading icon for a row (grammar pen / readability "Aa" / duplicate copy). */
const KindIcon = ({ kind }: { kind: Kind }) => {
    const { color } = KIND[kind];
    return (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}1a` }}>
            {kind === "readability" ? (
                <span className="font-poppins text-[1.05rem] font-bold leading-none" style={{ color }}>Aa</span>
            ) : (
                <Stroke d={kind === "grammar" ? PATHS.pen : PATHS.copy} color={color} className="h-5 w-5" />
            )}
        </span>
    );
};

/**
 * Content quality audit. Runs the deterministic textTools engines over the
 * workspace's own published pages and lists every flagged page+issue with a
 * direct path to fix it in the editor. The ?issue= query pre-selects a category.
 */
const ContentQuality = () => {
    const params = useSearchParams();
    const requested = params.get("issue") as IssueKind | null;
    const [filter, setFilter] = useState<IssueKind>(requested && FILTERS.some((f) => f.id === requested) ? requested : "all");
    const [sort, setSort] = useState("newest");
    const [page, setPage] = useState(1);
    const [scanning, setScanning] = useState(true);
    const [results, setResults] = useState<PageResult[]>([]);

    useEffect(() => {
        const q = params.get("issue");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (q && FILTERS.some((f) => f.id === q)) setFilter(q as IssueKind);
    }, [params]);

    useEffect(() => {
        let off = false;
        (async () => {
            const entries = await api<Entry[]>("/entries?status=PUBLISHED").catch(() => [] as Entry[]);
            if (off) return;
            const docs = entries
                .slice(0, SCAN_LIMIT)
                .map((e) => ({ id: e.id, title: e.title || "Untitled", slug: e.slug ?? "", type: e.contentType?.name ?? "Page", updatedAt: e.updatedAt ? +new Date(e.updatedAt) : 0, text: plainBody(e) }))
                .filter((d) => d.text.length >= 60);
            const corpus: CorpusPage[] = docs.map((d) => ({ title: d.title, body: d.text }));
            const out: PageResult[] = docs
                .map((d, i) => {
                    const grammar = checkGrammar(d.text).issues;
                    const duplicates = checkOriginality(d.text, corpus.filter((_, j) => j !== i)).notes
                        .filter((n) => n.severity !== "low")
                        .map((n) => ({ ...n, snippet: originalPhrase(d.text, n.snippet) }));
                    const r = readabilityScore(d.text);
                    const low = r < READABILITY_FLOOR;
                    return { id: d.id, title: d.title, slug: d.slug, type: d.type, updatedAt: d.updatedAt, grammar, duplicates, readability: low ? r : null, readSentence: low ? longSentence(d.text) : "" };
                })
                .filter((p) => p.grammar.length || p.duplicates.length || p.readability !== null);
            setResults(out);
            setScanning(false);
        })();
        return () => {
            off = true;
        };
    }, []);

    // Flatten pages into one row per (page × issue kind).
    const allItems = useMemo<Item[]>(() => {
        const items: Item[] = [];
        for (const r of results) {
            const fix = (snippet?: string) => `/content/editor?id=${r.id}${snippet ? `&highlight=${encodeURIComponent(snippet)}` : ""}`;
            if (r.grammar.length) {
                items.push({ key: `${r.id}-g`, id: r.id, title: r.title, slug: r.slug, updatedAt: r.updatedAt, kind: "grammar", issues: r.grammar.length, detail: `${r.grammar.length} issue${r.grammar.length > 1 ? "s" : ""} found`, href: fix(r.grammar[0]?.text) });
            }
            if (r.duplicates.length) {
                const { pages, similarity } = dupSummary(r.duplicates);
                const detail = pages > 0 ? `Matches ${pages} page${pages > 1 ? "s" : ""}${similarity ? ` (${similarity}% similar)` : ""}` : `${r.duplicates.length} duplicate passage${r.duplicates.length > 1 ? "s" : ""}`;
                items.push({ key: `${r.id}-d`, id: r.id, title: r.title, slug: r.slug, updatedAt: r.updatedAt, kind: "duplicates", issues: r.duplicates.length, detail, href: fix(r.duplicates[0]?.snippet) });
            }
            if (r.readability !== null) {
                items.push({ key: `${r.id}-r`, id: r.id, title: r.title, slug: r.slug, updatedAt: r.updatedAt, kind: "readability", issues: 1, detail: `Grade: ${gradeOf(r.readability)}`, href: fix(r.readSentence || undefined) });
            }
        }
        return items;
    }, [results]);

    const countFor = (k: IssueKind) => (k === "all" ? allItems.length : allItems.filter((i) => i.kind === k).length);

    const shown = useMemo(() => {
        const list = allItems.filter((i) => filter === "all" || i.kind === filter);
        const sorted = [...list];
        if (sort === "newest") sorted.sort((a, b) => b.updatedAt - a.updatedAt);
        else if (sort === "issues") sorted.sort((a, b) => b.issues - a.issues);
        else sorted.sort((a, b) => a.title.localeCompare(b.title));
        return sorted;
    }, [allItems, filter, sort]);

    // Paginate (10 per page). Clamp in case a filter shrinks the list below the
    // current page.
    const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const paged = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    if (scanning) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
                <p className="text-body-sm text-grey">Scanning your published pages&hellip;</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            {/* Filter pills (kept from before) */}
            <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => {
                    const n = countFor(f.id);
                    const active = filter === f.id;
                    return (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                                setFilter(f.id);
                                setPage(1);
                            }}
                            className={cn(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-caption-1 font-semibold transition-colors",
                                active ? "bg-primary text-white shadow-glow" : "bg-lavender-mist text-black hover:text-primary dark:bg-dark-3 dark:text-dark-text",
                            )}
                        >
                            {f.label}
                            <span className={cn("rounded-md px-1.5 text-caption-2", active ? "bg-white/20" : "bg-white/70 text-grey dark:bg-dark-1/60")}>{n}</span>
                        </button>
                    );
                })}
            </div>

            {/* List header + sort */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-h5 text-black dark:text-white">Pages that need your attention</h2>
                <Select variant="filter" value={sort} onChange={(v) => { setSort(v); setPage(1); }} ariaLabel="Sort pages" align="end" options={SORTS.map((s) => ({ value: s.value, label: `Sort by: ${s.label}` }))} />
            </div>

            {shown.length === 0 ? (
                <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
                        <Stroke d="M20 6 9 17l-5-5" color="#00B894" className="h-6 w-6" />
                    </span>
                    <p className="text-h6 text-black dark:text-white">Nothing to fix here</p>
                    <p className="text-body-sm text-grey">No {filter === "all" ? "" : `${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} `}issues in your latest published pages.</p>
                </Card>
            ) : (
                <>
                    <Card className="!p-0">
                        <div className="divide-y divide-grey-light dark:divide-grey-light/10">
                            {paged.map((item) => (
                                <Row key={item.key} item={item} />
                            ))}
                        </div>
                    </Card>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-caption-2 text-grey">
                                Showing {(safePage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(safePage * PAGE_SIZE, shown.length)} of {shown.length}
                            </p>
                            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
                        </div>
                    )}
                </>
            )}

            {/* Tip banner */}
            {shown.length > 0 && (
                <div className="flex items-center gap-2.5 rounded-2xl bg-primary/[0.06] px-4 py-3 dark:bg-primary/10">
                    <Stroke d={PATHS.sparkle} className="h-4 w-4 shrink-0 text-primary dark:text-lilac" />
                    <p className="text-caption-1 text-grey">
                        <span className="font-semibold text-black dark:text-white">Tip:</span> Fixing these issues improves readability, builds trust, and helps your content perform better.
                    </p>
                </div>
            )}
        </div>
    );
};

const Row = ({ item }: { item: Item }) => {
    const k = KIND[item.kind];
    return (
        <div className="group flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-lavender-mist/40 dark:hover:bg-dark-3/30">
            <KindIcon kind={item.kind} />

            <div className="min-w-0 grow basis-56">
                <Link href={item.href} className="line-clamp-2 font-poppins text-body font-semibold text-black transition-colors hover:text-primary dark:text-white dark:hover:text-lilac">{item.title}</Link>
                {item.slug && <p className="mt-0.5 truncate text-caption-2 text-grey">/{item.slug}</p>}
            </div>

            {/* issue badge */}
            <div className="w-36 shrink-0">
                {k.pill ? (
                    <span className="inline-flex items-center rounded-[0.4rem] bg-primary/10 px-2.5 py-1 text-caption-2 font-semibold text-primary dark:text-lilac">{k.label}</span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-caption-1 font-semibold" style={{ color: k.color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: k.color }} />
                        {k.label}
                    </span>
                )}
            </div>

            {/* detail */}
            <div className="w-44 shrink-0 text-caption-1 text-grey">{item.detail}</div>

            {/* actions */}
            <Link href={item.href} className="btn-secondary btn-sm shrink-0">
                Review
                <Stroke d={PATHS.chevronRight} className="h-3.5 w-3.5" />
            </Link>

            <Menu as="div" className="relative shrink-0">
                <Menu.Button aria-label="More actions" className="flex h-9 w-9 items-center justify-center rounded-[0.4rem] text-grey transition-colors hover:bg-lavender-mist hover:text-black dark:hover:bg-dark-3 dark:hover:text-white">
                    <Stroke d={PATHS.dots} className="h-5 w-5" />
                </Menu.Button>
                <Transition as={Fragment} enter="transition ease-out duration-150" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="transition ease-in duration-100" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                    <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right overflow-hidden rounded-xl border border-grey-light bg-white p-1.5 shadow-[0_1rem_2.5rem_rgba(26,26,46,0.14)] focus:outline-none dark:border-grey-light/15 dark:bg-dark-1">
                        <Menu.Item>
                            {({ active }) => (
                                <Link href={item.href} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm text-black dark:text-white", active && "bg-lavender-mist dark:bg-dark-3")}>
                                    <Stroke d={PATHS.pen} className="h-4 w-4 text-grey" />Open in editor
                                </Link>
                            )}
                        </Menu.Item>
                        <Menu.Item>
                            {({ active }) => (
                                <Link href="/ai/proofreading" className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm text-black dark:text-white", active && "bg-lavender-mist dark:bg-dark-3")}>
                                    <Stroke d={PATHS.wand} className="h-4 w-4 text-grey" />Fix with AI
                                </Link>
                            )}
                        </Menu.Item>
                    </Menu.Items>
                </Transition>
            </Menu>
        </div>
    );
};

export default ContentQuality;
