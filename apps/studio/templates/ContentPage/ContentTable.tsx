"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Dialog, Menu, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Checkbox from "@/components/ui/Checkbox";
import Icon from "@/components/ui/Icon";
import StatusPill, { type PillStatus } from "@/components/ui/StatusPill";
import Pagination from "@/components/ui/Pagination";
import FilterBar, { type Filters, type SortKey, type SortDir } from "@/templates/ContentPage/FilterBar";
import SeoScoreBadge from "@/templates/ContentPage/SeoScoreBadge";
import BulkActionBar, { type BulkAction } from "@/templates/ContentPage/BulkActionBar";
import VersionsModal from "@/templates/ContentPage/VersionsModal";
import ScheduleModal from "@/components/editor/ScheduleModal";
import { api, ApiError } from "@/lib/api";
import { fetchEntryIds, fetchEntryPage, type EntryPageQuery } from "@/lib/entries";
import { useAuth } from "@/components/providers/AuthProvider";
import { useJobs } from "@/components/providers/JobsProvider";
import { formatDate } from "@/lib/format";
import CountUp from "@/components/motion/CountUp";
import { useWorkspace, localeName } from "@/lib/useWorkspace";
import { cn } from "@/lib/cn";
import { CONTENT_LIST_URL_KEY } from "@/lib/contentListUrl";
import { useScrollResetOnChange } from "@/lib/useScroll";
import { confirm, notice } from "@/components/providers/ConfirmProvider";

const PAGE_SIZE = 15;

/* ─── types ─────────────────────────────────────────────── */

type RowStatus = PillStatus;

type EntryRow = {
    id: string;
    title: string;
    slug: string;
    typeId: string;
    typeName: string;
    status: RowStatus;
    author: {
        name: string;
        id?: string | null;
        avatarUrl?: string | null;
        avatarStyle?: string | null;
    };
    locale: string;
    seoScore: number | null;
    updatedAt: string;
    views: number;
};

type ApiEntry = {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    locale: string;
    contentType: { id: string; name: string };
    author: {
        name: string;
        id?: string | null;
        avatarUrl?: string | null;
        avatarStyle?: string | null;
    } | null;
    updatedAt: string;
    data: Record<string, unknown> | null;
};

const STATUS_MAP: Record<string, RowStatus> = {
    DRAFT: "draft",
    IN_REVIEW: "review",
    APPROVED: "approved",
    SCHEDULED: "scheduled",
    PUBLISHED: "live",
    ARCHIVED: "draft",
};

const mapEntry = (e: ApiEntry): EntryRow => ({
    id: e.id,
    title: e.title,
    slug: e.slug ?? "",
    typeId: e.contentType.id,
    typeName: e.contentType.name,
    status: STATUS_MAP[e.status] ?? "draft",
    author: e.author ?? { name: "Unassigned" },
    locale: e.locale ?? "en",
    seoScore: typeof e.data?.seoScore === "number" ? (e.data.seoScore as number) : null,
    updatedAt: e.updatedAt,
    views: typeof e.data?.views === "number" ? (e.data.views as number) : 0,
});

/** A status filter in the UI, as the database statuses it stands for. */
const STATUS_QUERY: Record<string, string> = { live: "PUBLISHED", scheduled: "SCHEDULED", review: "IN_REVIEW", draft: "DRAFT,ARCHIVED" };

const STATUS_PARAMS: readonly string[] = ["live", "scheduled", "review", "draft"];
const statusFromParam = (s: string | null): Filters["status"] =>
    s && STATUS_PARAMS.includes(s) ? (s as Filters["status"]) : "all";

const SORT_KEYS: SortKey[] = ["title", "seoScore", "updated", "views"];

const formatTime = (iso: string): string =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/* ─── inline icon strip (lucide-style stroke paths) ─────── */

const Stroke = ({ d, color, className }: { d: string; color?: string; className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);

const STAT_PATHS = {
    all: "M3 6h18M3 12h18M3 18h12",
    live: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
};

/* ─── main component ─────────────────────────────────────── */

const ContentTable = ({ lockedTypeId }: { lockedTypeId?: string } = {}) => {
    const ws = useWorkspace();
    const searchParams = useSearchParams();

    // One page of rows at a time: the server searches, filters, sorts and pages, so
    // the list works the same with fifty entries or fifty thousand.
    const [rows, setRows] = useState<EntryRow[]>([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState<Record<string, number>>({});
    const [authorOptions, setAuthorOptions] = useState<{ id: string; name: string }[]>([]);
    const loadSeq = useRef(0);
    const [types, setTypes] = useState<{ id: string; name: string; pageType?: string }[]>([]);
    const [loading, setLoading] = useState(true);
    // The All-content list keeps its view (search, filters, sort, page) in the URL, so
    // coming back from the editor or reloading lands on the same place. Type-locked
    // reference lists don't: they share their page with a tab switcher.
    const syncUrl = !lockedTypeId;
    const param = (k: string) => (syncUrl ? searchParams.get(k) : null);
    const [filters, setFilters] = useState<Filters>(() => ({
        query: param("q") ?? "",
        type: param("type") ?? "all",
        status: statusFromParam(searchParams.get("status")),
        author: param("by") ?? "all",
    }));
    const [localeFilter, setLocaleFilter] = useState(() => param("locale") ?? "all");
    const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(() => {
        const key = param("sort") as SortKey | null;
        return { key: key && SORT_KEYS.includes(key) ? key : "updated", dir: param("dir") === "asc" ? "asc" : "desc" };
    });
    const [page, setPage] = useState(() => Math.max(1, Math.floor(Number(param("page"))) || 1));
    const [skelVisible, setSkelVisible] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [historyId, setHistoryId] = useState<string | null>(null);
    const [translate, setTranslate] = useState<EntryRow | null>(null);
    const [bulkBusy, setBulkBusy] = useState(false);
    // Ids awaiting a schedule date (a single row, or the current bulk selection).
    const [scheduleIds, setScheduleIds] = useState<string[] | null>(null);
    const { can } = useAuth();
    const canSchedule = can("content.publish");

    const listTopRef = useRef<HTMLDivElement>(null);
    useScrollResetOnChange(listTopRef, `${filters.status}|${filters.type}|${localeFilter}`);

    // Keep status filter in sync with ?status= URL param.
    useEffect(() => {
        const next = statusFromParam(searchParams.get("status"));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFilters((f) => (f.status === next ? f : { ...f, status: next }));
    }, [searchParams]);

    // Mirror the view into the URL (replaceState: no history entry per keystroke) and
    // remember it for the editor's back button. Defaults are left out to keep URLs clean.
    useEffect(() => {
        if (!syncUrl) return;
        const params = new URLSearchParams(window.location.search);
        const set = (k: string, v: string, def: string) => (v && v !== def ? params.set(k, v) : params.delete(k));
        set("q", filters.query.trim(), "");
        set("type", filters.type, "all");
        set("status", filters.status, "all");
        set("by", filters.author, "all");
        set("locale", localeFilter, "all");
        set("sort", sort.key, "updated");
        set("dir", sort.dir, "desc");
        set("page", String(page), "1");
        const qs = params.toString();
        const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
        if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", url);
        try {
            sessionStorage.setItem(CONTENT_LIST_URL_KEY, url);
        } catch {
            /* storage blocked: back falls through to plain /content */
        }
    }, [syncUrl, filters, localeFilter, sort, page]);

    const mineOnly = searchParams.get("author") === "me";
    const multiLocale = (ws?.locales.length ?? 1) > 1;
    const { enqueue } = useJobs();

    // Search waits for a pause in typing, so each keystroke isn't a request.
    const [query, setQuery] = useState(filters.query);
    useEffect(() => {
        const t = setTimeout(() => setQuery(filters.query), 250);
        return () => clearTimeout(t);
    }, [filters.query]);

    // What the list is showing, without paging or order: shared by the page request
    // and by "select all", so both always mean the same set of entries.
    const matching = useMemo<EntryPageQuery>(
        () => ({
            q: query.trim(),
            // A type-locked list (a Reference sub-tab) shows that type only; the
            // All Content view shows everything except reference types.
            typeId: lockedTypeId ?? (filters.type !== "all" ? filters.type : undefined),
            scope: lockedTypeId ? undefined : "content",
            status: STATUS_QUERY[filters.status],
            author: mineOnly ? "me" : filters.author !== "all" ? filters.author : undefined,
            locale: localeFilter !== "all" ? localeFilter : undefined,
        }),
        [query, filters.type, filters.status, filters.author, localeFilter, mineOnly, lockedTypeId],
    );

    const load = useCallback(async () => {
        const seq = ++loadSeq.current;
        try {
            const res = await fetchEntryPage<ApiEntry>({
                ...matching,
                sort: sort.key,
                dir: sort.dir,
                page,
                pageSize: PAGE_SIZE,
                facets: true,
            });
            if (seq !== loadSeq.current) return; // a newer request is on its way
            setRows(res.items.map(mapEntry));
            setTotal(res.total);
            setStats(res.stats ?? {});
            setAuthorOptions([...(res.authors ?? [])].sort((a, b) => (a.id === "none" ? 1 : b.id === "none" ? -1 : a.name.localeCompare(b.name))));
            // The last page emptied (rows deleted or moved): step back to the new last page.
            const last = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
            if (page > last) setPage(last);
        } catch {
            /* content.read required */
        } finally {
            if (seq === loadSeq.current) setLoading(false);
        }
    }, [matching, sort, page]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on change; state is set after the request resolves
        void load();
    }, [load]);

    useEffect(() => {
        api<{ id: string; name: string; pageType?: string }[]>("/content-types")
            .then((cts) => setTypes(cts.map((t) => ({ id: t.id, name: t.name, pageType: t.pageType }))))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setSkelVisible(true), 250);
        return () => clearTimeout(t);
    }, []);

    /* ─── actions ─────────────────────────────────────────── */

    const duplicate = async (id: string) => {
        await api(`/entries/${id}/duplicate`, { method: "POST" });
        await load();
    };
    const moveToDraft = async (id: string) => {
        await api(`/entries/${id}/unpublish`, { method: "POST" });
        await load();
    };
    const remove = async (id: string) => {
        if (!(await confirm({ title: "Delete this content?", message: "This can't be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
        await api(`/entries/${id}`, { method: "DELETE" });
        setSelected((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        await load();
    };
    const bulkAction = async (action: BulkAction) => {
        const ids = [...selected];
        if (!ids.length) return;
        // Every bulk action runs as a background job, so the app stays usable however
        // many items are selected. Scheduling asks for a date/time first.
        if (action === "schedule") {
            setScheduleIds(ids);
            return;
        }
        if (action === "delete" && !(await confirm({ title: `Delete ${ids.length} item${ids.length === 1 ? "" : "s"}?`, message: "This can't be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
        setBulkBusy(true);
        try {
            await enqueue(`/entries/bulk/${action}`, { ids });
            setSelected(new Set());
            setTimeout(() => void load(), 1500);
        } finally {
            setBulkBusy(false);
        }
    };
    /** Apply the chosen publish time to every queued id (a row or the bulk set). */
    const doSchedule = async (iso: string) => {
        const ids = scheduleIds ?? [];
        setScheduleIds(null);
        if (!ids.length) return;
        setBulkBusy(true);
        try {
            // More than one item: a background job, like every other bulk action. A
            // single row is scheduled directly, so a problem shows up straight away.
            if (ids.length > 1) {
                await enqueue("/entries/bulk/schedule", { ids, scheduledAt: iso });
                setSelected(new Set());
                setTimeout(() => void load(), 1500);
                return;
            }
            const results = await Promise.allSettled(
                ids.map((id) => api(`/entries/${id}`, { method: "PATCH", body: JSON.stringify({ status: "SCHEDULED", scheduledAt: iso }) })),
            );
            const failed = results.filter((r) => r.status === "rejected");
            if (failed.length) {
                const first = failed[0] as PromiseRejectedResult;
                const msg = first.reason instanceof ApiError ? first.reason.message : "Some items couldn't be scheduled.";
                void notice({ title: "Scheduling issue", message: failed.length === ids.length ? msg : `${ids.length - failed.length} scheduled. ${failed.length} couldn't be: ${msg}`, tone: "danger" });
            }
            setSelected(new Set());
            await load();
        } finally {
            setBulkBusy(false);
        }
    };
    const addTranslation = async (row: EntryRow, locale: string) => {
        await api("/entries", {
            method: "POST",
            body: JSON.stringify({ contentTypeId: row.typeId, title: row.title, slug: row.slug || undefined, locale }),
        });
        setTranslate(null);
        setLocaleFilter(locale);
        await load();
    };

    /* ─── derived data ────────────────────────────────────── */

    // Reference-page types (tags, cities, …) are managed under the dedicated Reference
    // tab, so the type filter of the All Content view leaves them out.
    const filterableTypes = useMemo(() => types.filter((t) => t.pageType !== "reference"), [types]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const current = Math.min(page, totalPages);
    const pagedRows = rows;

    // "Select all" means every entry the list is showing, on every page. The page's
    // own rows can be picked separately with "Select this page".
    const pageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const allSelected = pageSelected && selected.size >= total;
    const someSelected = selected.size > 0;
    const [selecting, setSelecting] = useState(false);
    const selectAllMatching = async () => {
        setSelecting(true);
        try {
            setSelected(new Set(await fetchEntryIds(matching)));
        } catch {
            void notice({ title: "Could not select everything", message: "Please try again.", tone: "danger" });
        } finally {
            setSelecting(false);
        }
    };
    const selectPage = () => setSelected((prev) => new Set([...prev, ...rows.map((r) => r.id)]));
    const toggleAll = (checked: boolean) => (checked ? void selectAllMatching() : setSelected(new Set()));
    const toggleOne = (id: string, checked: boolean) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    const setSortKey = (key: SortKey) => {
        setPage(1);
        setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
    };

    /* ─── stat bar ────────────────────────────────────────── */

    const n = (k: string) => stats[k] ?? 0;
    const statAll = n("total");
    const statLive = n("PUBLISHED");
    const statScheduled = n("SCHEDULED");
    const statDraftReview = n("DRAFT") + n("ARCHIVED") + n("IN_REVIEW");

    /* ─── locale options for FilterBar ───────────────────── */

    const localeOptions = useMemo(() => [
        { value: "all", label: "All languages" },
        ...(ws?.locales ?? []).map((l) => ({ value: l, label: localeName(l) })),
    ], [ws]);

    /* ─── render ──────────────────────────────────────────── */

    return (
        <div className="flex flex-col gap-5">
            <div ref={listTopRef} className="scroll-mt-6" />

            {mineOnly && (
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1 text-caption-1 font-semibold text-primary dark:text-lilac">
                        Showing only your content
                    </span>
                    <Link href="/content" className="text-caption-1 font-medium text-grey transition-colors hover:text-black dark:hover:text-white">
                        Clear
                    </Link>
                </div>
            )}

            {/* Stat bar (hidden in a single-type scoped view, e.g. a Reference sub-tab) */}
            {!lockedTypeId && (
                <Card id="tour-content-overview" className="!p-5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                        <StatTile icon={STAT_PATHS.all} color="var(--color-primary)" value={statAll} label="All content" />
                        <StatTile icon={STAT_PATHS.live} color="#00B894" value={statLive} label="Live" />
                        <StatTile icon={STAT_PATHS.calendar} color="#3B82F6" value={statScheduled} label="Publishing this week" />
                        <StatTile icon={STAT_PATHS.clock} color="#F5A623" value={statDraftReview} label="Draft and review" />
                    </div>
                </Card>
            )}

            {/* Filters */}
            <FilterBar
                filters={filters}
                onChange={(next) => { setFilters(next); setPage(1); }}
                total={total}
                types={filterableTypes}
                authors={authorOptions}
                localeOptions={multiLocale ? localeOptions : []}
                localeFilter={localeFilter}
                onLocaleChange={(l) => { setLocaleFilter(l); setPage(1); }}
                sort={sort}
                onSortChange={(key) => { setSortKey(key); }}
                hideTypeFilter={!!lockedTypeId}
            />

            {/* Selection: everything that matches, or just the rows on screen */}
            {!loading && total > 0 && (
                <div className="-mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-caption-1">
                    <span className="text-grey">
                        {selected.size > 0 ? `${selected.size.toLocaleString()} of ${total.toLocaleString()} selected` : "Select"}
                    </span>
                    <button type="button" onClick={() => void selectAllMatching()} disabled={selecting || allSelected} className="font-semibold text-primary transition-opacity hover:opacity-70 disabled:opacity-40 dark:text-lilac">
                        {selecting ? "Selecting…" : `All ${total.toLocaleString()}`}
                    </button>
                    {total > rows.length && (
                        <button type="button" onClick={selectPage} disabled={pageSelected} className="font-semibold text-primary transition-opacity hover:opacity-70 disabled:opacity-40 dark:text-lilac">
                            This page ({rows.length})
                        </button>
                    )}
                    {selected.size > 0 && (
                        <button type="button" onClick={() => setSelected(new Set())} className="font-semibold text-grey transition-colors hover:text-black dark:hover:text-white">
                            Clear
                        </button>
                    )}
                </div>
            )}

            {/* Table */}
            <Card className="!p-0 overflow-hidden">
                {/* Header */}
                <div className="hidden md:grid grid-cols-[auto_2.2fr_1fr_1.1fr_0.7fr_1fr_2rem] items-center gap-4 px-5 py-3 border-b border-grey-light text-caption-2 text-grey dark:border-grey-light/10">
                    <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} onChange={toggleAll} aria-label={`Select all ${total.toLocaleString()}`} />
                    <SortHeader label="Title" active={sort.key === "title"} dir={sort.dir} onClick={() => setSortKey("title")} />
                    <span>Status</span>
                    <span>Author</span>
                    <SortHeader label="SEO" active={sort.key === "seoScore"} dir={sort.dir} onClick={() => setSortKey("seoScore")} />
                    <SortHeader label="Updated" active={sort.key === "updated"} dir={sort.dir} onClick={() => setSortKey("updated")} />
                    <span className="sr-only">Actions</span>
                </div>

                {loading ? (
                    <div className={cn("transition-opacity duration-300", skelVisible ? "animate-pulse opacity-100" : "opacity-0")}>
                        {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                            <SkeletonRow key={`sk-${i}`} />
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="px-5 py-16 text-center text-body text-grey">
                        {statAll === 0 ? "No content yet: create your first piece." : "No content matches your filters."}
                    </div>
                ) : (
                    <>
                        {pagedRows.map((row) => (
                            <Row
                                key={row.id}
                                row={row}
                                selected={selected.has(row.id)}
                                onSelect={(c) => toggleOne(row.id, c)}
                                onDuplicate={() => void duplicate(row.id)}
                                onMoveToDraft={() => void moveToDraft(row.id)}
                                onSchedule={canSchedule ? () => setScheduleIds([row.id]) : undefined}
                                onDelete={() => void remove(row.id)}
                                onHistory={() => setHistoryId(row.id)}
                                onTranslate={multiLocale ? () => setTranslate(row) : undefined}
                            />
                        ))}
                        {/* Pad the last page so the pager stays put. */}
                        {totalPages > 1 &&
                            pagedRows.length < PAGE_SIZE &&
                            Array.from({ length: PAGE_SIZE - pagedRows.length }).map((_, i) => (
                                <div key={`pad-${i}`} className="opacity-0" aria-hidden>
                                    <SkeletonRow />
                                </div>
                            ))}
                    </>
                )}
            </Card>

            {!loading && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-caption-1 text-grey">
                    <span>
                        Showing {total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1}&ndash;{Math.min(current * PAGE_SIZE, total)} of {total.toLocaleString()}
                    </span>
                    {totalPages > 1 && (
                        <Pagination page={current} totalPages={totalPages} onChange={setPage} />
                    )}
                </div>
            )}

            <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())} onAction={bulkAction} busy={bulkBusy} canSchedule={canSchedule} />

            <ScheduleModal open={!!scheduleIds} onClose={() => setScheduleIds(null)} onSchedule={(_label, iso) => void doSchedule(iso)} />

            <VersionsModal
                entryId={historyId}
                title={rows.find((i) => i.id === historyId)?.title ?? ""}
                onClose={() => setHistoryId(null)}
                onRestored={load}
            />
            {translate && (
                <TranslateModal
                    row={translate}
                    locales={(ws?.locales ?? []).filter((l) => l !== translate.locale)}
                    onClose={() => setTranslate(null)}
                    onPick={(l) => void addTranslation(translate, l)}
                />
            )}
        </div>
    );
};

/* ─── stat tile ──────────────────────────────────────────── */

const StatTile = ({ icon, color, value, label }: { icon: string; color: string; value: number; label: string }) => (
    <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
            <Stroke d={icon} color={color} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
            <CountUp value={value} className="font-poppins text-[1.5rem] leading-none font-extrabold text-black dark:text-white" />
            <div className="mt-1 truncate text-caption-2 text-grey">{label}</div>
        </div>
    </div>
);

/* ─── sort header ────────────────────────────────────────── */

const SortHeader = ({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn("inline-flex items-center gap-1 transition-colors hover:text-primary", active && "text-primary")}
    >
        {label}
        <Icon
            className={cn("w-3.5 h-3.5 transition-transform", active ? "fill-primary" : "fill-grey", active && dir === "asc" && "rotate-180")}
            name="arrow-down"
        />
    </button>
);

/* ─── skeleton row ───────────────────────────────────────── */

const SkeletonRow = () => (
    <div className="grid grid-cols-[auto_1fr_2rem] md:grid-cols-[auto_2.2fr_1fr_1.1fr_0.7fr_1fr_2rem] items-center gap-4 px-5 py-5 border-b border-grey-light last:border-b-0 dark:border-grey-light/10">
        <div className="h-4 w-4 rounded bg-grey-light dark:bg-dark-3" />
        <div className="min-w-0">
            <div className="h-4 w-2/3 rounded bg-grey-light dark:bg-dark-3" />
            <div className="mt-2.5 flex items-center gap-1.5">
                <div className="h-3 w-6 rounded bg-grey-light/70 dark:bg-dark-3/70" />
                <div className="h-3 w-28 rounded bg-grey-light/70 dark:bg-dark-3/70" />
            </div>
        </div>
        <div className="hidden md:block"><div className="h-6 w-16 rounded-md bg-grey-light dark:bg-dark-3" /></div>
        <div className="hidden md:flex items-center gap-2">
            <div className="h-7 w-7 shrink-0 rounded-full bg-grey-light dark:bg-dark-3" />
            <div className="h-2.5 w-16 rounded bg-grey-light/70 dark:bg-dark-3/70" />
        </div>
        <div className="hidden md:block"><div className="h-6 w-9 rounded-md bg-grey-light dark:bg-dark-3" /></div>
        <div className="hidden md:block">
            <div className="h-3 w-20 rounded bg-grey-light dark:bg-dark-3" />
            <div className="mt-1.5 h-2.5 w-12 rounded bg-grey-light/70 dark:bg-dark-3/70" />
        </div>
        <div className="h-8 w-8 justify-self-end rounded-lg bg-grey-light dark:bg-dark-3" />
    </div>
);

/* ─── content row ────────────────────────────────────────── */

const Row = ({
    row,
    selected,
    onSelect,
    onDuplicate,
    onMoveToDraft,
    onSchedule,
    onDelete,
    onHistory,
    onTranslate,
}: {
    row: EntryRow;
    selected: boolean;
    onSelect: (checked: boolean) => void;
    onDuplicate: () => void;
    onMoveToDraft: () => void;
    onSchedule?: () => void;
    onDelete: () => void;
    onHistory: () => void;
    onTranslate?: () => void;
}) => {
    const editHref = `/content/editor?id=${row.id}`;
    return (
        <div
            className={cn(
                "grid grid-cols-[auto_1fr_2rem] md:grid-cols-[auto_2.2fr_1fr_1.1fr_0.7fr_1fr_2rem] items-center gap-4 px-5 py-5 border-b border-grey-light transition-colors last:border-b-0 dark:border-grey-light/10",
                selected ? "bg-lavender-mist/70 dark:bg-dark-3/60" : "hover:bg-lavender-mist/40 dark:hover:bg-dark-3/40",
            )}
        >
            <Checkbox checked={selected} onChange={onSelect} aria-label={`Select ${row.title}`} />

            {/* Title + locale + type/slug */}
            <div className="min-w-0">
                <Link href={editHref} className="block truncate text-title font-semibold text-black transition-colors hover:text-primary dark:text-white dark:hover:text-lilac">
                    {row.title}
                </Link>
                <span className="mt-1.5 flex items-center gap-1.5 truncate text-caption-2 text-grey">
                    <span className="inline-flex shrink-0 items-center rounded bg-lavender-mist px-1.5 py-0.5 text-[0.625rem] font-bold uppercase text-primary dark:bg-dark-3 dark:text-lilac">
                        {row.locale}
                    </span>
                    <span className="truncate">{row.slug ? `${row.slug} · ${row.typeName}` : row.typeName}</span>
                </span>
            </div>

            {/* Status */}
            <div className="hidden md:block">
                <StatusPill status={row.status} />
            </div>

            {/* Author */}
            <div className="hidden md:flex items-center gap-2 min-w-0">
                <Avatar
                    size={28}
                    userId={row.author.id}
                    src={row.author.avatarUrl}
                    character={row.author.avatarStyle}
                    name={row.author.name}
                />
                <span className="truncate text-body-sm text-grey">{row.author.name}</span>
            </div>

            {/* SEO score */}
            <div className="hidden md:block">
                <SeoScoreBadge score={row.seoScore} />
            </div>

            {/* Updated */}
            <div className="hidden md:block" suppressHydrationWarning>
                <span className="block text-body-sm text-black dark:text-white">{formatDate(row.updatedAt)}</span>
                <span className="block text-caption-2 text-grey">{formatTime(row.updatedAt)}</span>
            </div>

            {/* Row actions */}
            <Menu as="div" className="relative justify-self-end">
                <Menu.Button
                    aria-label="Row actions"
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-grey transition-colors hover:bg-white hover:text-primary data-[headlessui-state=open]:bg-white data-[headlessui-state=open]:text-primary dark:hover:bg-dark-1"
                >
                    <Icon className="fill-current" name="dots" />
                </Menu.Button>
                <Transition
                    enter="transition duration-100 ease-out"
                    enterFrom="opacity-0 scale-95 -translate-y-1"
                    enterTo="opacity-100 scale-100 translate-y-0"
                    leave="transition duration-75 ease-in"
                    leaveFrom="opacity-100 scale-100"
                    leaveTo="opacity-0 scale-95"
                >
                    <Menu.Items
                        anchor={{ to: "bottom end", gap: 8 }}
                        className="z-30 w-48 p-1.5 rounded-2xl border border-grey-light bg-white shadow-[0_1.25rem_2.5rem_rgba(26,26,46,0.16)] focus:outline-none dark:bg-dark-1 dark:border-grey-light/10"
                    >
                        <RowMenuItem as="link" href={editHref} icon="edit" label="Open in editor" />
                        <RowMenuItem icon="clock" label="Version history" onClick={onHistory} />
                        {onTranslate && <RowMenuItem icon="grid" label="Add translation" onClick={onTranslate} />}
                        <RowMenuItem icon="copy" label="Duplicate" onClick={onDuplicate} />
                        {onSchedule && row.status !== "live" && (
                            <RowMenuItem icon="calendar" label={row.status === "scheduled" ? "Reschedule…" : "Schedule…"} onClick={onSchedule} />
                        )}
                        <RowMenuItem icon="document" label="Move to draft" onClick={onMoveToDraft} />
                        <div className="my-1 h-px bg-grey-light dark:bg-grey-light/10" />
                        <RowMenuItem icon="trash" label="Delete" onClick={onDelete} danger />
                    </Menu.Items>
                </Transition>
            </Menu>
        </div>
    );
};

/* ─── row menu item ──────────────────────────────────────── */

const RowMenuItem = ({
    as,
    href,
    icon,
    label,
    onClick,
    danger,
}: {
    as?: "link";
    href?: string;
    icon: string;
    label: string;
    onClick?: () => void;
    danger?: boolean;
}) => {
    const cls = (active: boolean) =>
        cn(
            "flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-body-sm font-medium transition-colors",
            danger ? cn("text-error", active && "bg-error/10") : cn("text-black dark:text-white", active && "bg-lavender-mist dark:bg-dark-3"),
        );
    return (
        <Menu.Item>
            {({ active }) =>
                as === "link" && href ? (
                    <Link href={href} className={cls(active)}>
                        <Icon className={cn("w-4 h-4", danger ? "fill-error" : "fill-grey")} name={icon} />
                        {label}
                    </Link>
                ) : (
                    <button type="button" onClick={onClick} className={cls(active)}>
                        <Icon className={cn("w-4 h-4", danger ? "fill-error" : "fill-grey")} name={icon} />
                        {label}
                    </button>
                )
            }
        </Menu.Item>
    );
};

/* ─── translate modal ────────────────────────────────────── */

const TranslateModal = ({
    row,
    locales,
    onClose,
    onPick,
}: {
    row: EntryRow;
    locales: string[];
    onClose: () => void;
    onPick: (locale: string) => void;
}) => (
    <Transition appear show as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
            <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
            >
                <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0 scale-95 translate-y-2"
                        enterTo="opacity-100 scale-100 translate-y-0"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100 scale-100"
                        leaveTo="opacity-0 scale-95"
                    >
                        <Dialog.Panel className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                            <Dialog.Title className="text-h5 text-black dark:text-white">Add translation</Dialog.Title>
                            <p className="mt-0.5 mb-5 truncate text-caption-2 text-grey">
                                {`A new draft of "${row.title}" in another language.`}
                            </p>
                            {locales.length === 0 ? (
                                <p className="py-6 text-center text-caption-2 text-grey">
                                    No other languages enabled. Add some in Settings &rarr; Localization.
                                </p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {locales.map((l) => (
                                        <button
                                            key={l}
                                            type="button"
                                            onClick={() => onPick(l)}
                                            className="flex items-center justify-between rounded-2xl border border-grey-light px-4 py-3 text-left transition-colors hover:bg-lavender-mist dark:border-grey-light/10 dark:hover:bg-dark-3"
                                        >
                                            <span className="text-title text-black dark:text-white">{localeName(l)}</span>
                                            <span className="text-caption-2 font-mono text-grey">{l}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <button type="button" onClick={onClose} className="btn-secondary w-full mt-5">
                                Cancel
                            </button>
                        </Dialog.Panel>
                    </Transition.Child>
                </div>
            </div>
        </Dialog>
    </Transition>
);

export default ContentTable;
