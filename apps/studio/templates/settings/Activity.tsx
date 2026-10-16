"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Switch from "@/components/ui/Switch";
import Pagination from "@/components/ui/Pagination";
import UpgradeLock from "@/components/ui/UpgradeLock";
import ChangeList from "@/components/activity/ChangeList";
import { rowDetail } from "@/components/activity/ActivityFeed";
import { usePlan } from "@/components/providers/LicenseProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { notice } from "@/components/providers/ConfirmProvider";
import { api, ApiError, API_BASE } from "@/lib/api";
import { ACTION_FILTERS, actionLabel, type ActivityRow } from "@/lib/activity";
import { cn } from "@/lib/cn";

const PAGE = 50;
const FILTER_KEYS = ["user", "action", "type", "entry", "q", "from", "to"] as const;
type Filters = Record<(typeof FILTER_KEYS)[number], string>;

const dateInput =
    "h-9 rounded-lg border border-grey-light bg-white px-3 text-caption-1 text-black outline-none focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

/** Settings › Activity: the full, filterable log, its export, retention and alerts, and Deleted items. */
const Activity = () => {
    return (
        <div className="flex flex-col gap-6">
            <ActivityLog />
            <DeletedItems />
            <ActivitySettings />
        </div>
    );
};

const ActivityLog = () => {
    const router = useRouter();
    const params = useSearchParams();
    const { has } = usePlan();
    const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])) as Filters;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const [rows, setRows] = useState<ActivityRow[] | null>(null);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
    const [types, setTypes] = useState<{ apiId: string; name: string }[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const [search, setSearch] = useState(filters.q);

    const query = (f: Partial<Filters>) => {
        const p = new URLSearchParams();
        for (const k of FILTER_KEYS) if (f[k]) p.set(k, f[k]!);
        return p;
    };
    const setFilter = (k: keyof Filters, v: string) => {
        const p = query({ ...filters, [k]: v });
        router.replace(`/settings/activity${p.size ? `?${p}` : ""}`);
    };
    const qs = query(filters).toString();

    useEffect(() => {
        void api<{ id: string; name: string }[]>("/activity/actors").then(setActors).catch(() => {});
        void api<{ apiId: string; name: string }[]>("/content-types").then(setTypes).catch(() => {});
    }, []);

    // Refetch whenever the filters (in the URL) or the page change.
    useEffect(() => {
        let live = true;
        api<{ items: ActivityRow[]; total: number }>(`/activity?${qs}${qs ? "&" : ""}limit=${PAGE}&offset=${(page - 1) * PAGE}`)
            .then((res) => {
                if (!live) return;
                setRows(res.items);
                setTotal(res.total);
                setError(null);
            })
            .catch((e) => live && setError(e instanceof ApiError ? e.message : "Could not load the activity log."));
        return () => {
            live = false;
        };
    }, [qs, page]);

    const exportHref = (format: "csv" | "json") => `${API_BASE}/ee/audit/export?format=${format}${qs ? `&${qs}` : ""}`;
    const anyFilter = FILTER_KEYS.some((k) => filters[k]);

    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Activity</h2>
                    <p className="mt-1 text-caption-2 text-grey">
                        {rows === null ? "Loading…" : `${total.toLocaleString()} event${total === 1 ? "" : "s"}${anyFilter ? " match" : ""}`}. Append only: nothing here can be edited or deleted.
                    </p>
                </div>
                {has("audit_export") ? (
                    <div className="flex gap-2">
                        <a href={exportHref("csv")} className="btn-secondary h-9 px-3.5 text-caption-1">Export CSV</a>
                        <a href={exportHref("json")} className="btn-secondary h-9 px-3.5 text-caption-1">Export JSON</a>
                    </div>
                ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        setFilter("q", search.trim());
                    }}
                >
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or slug" aria-label="Search title or slug" className={cn(dateInput, "w-52")} />
                </form>
                <Select ariaLabel="Who" value={filters.user} active={!!filters.user} onChange={(v) => setFilter("user", v)} options={[{ value: "", label: "Everyone" }, ...actors.map((a) => ({ value: a.id, label: a.name }))]} />
                <Select ariaLabel="Action" value={filters.action} active={!!filters.action} onChange={(v) => setFilter("action", v)} options={ACTION_FILTERS} />
                <Select ariaLabel="Content type" value={filters.type} active={!!filters.type} onChange={(v) => setFilter("type", v)} options={[{ value: "", label: "All types" }, { value: "media", label: "Media" }, ...types.map((t) => ({ value: t.apiId, label: t.name }))]} />
                <label className="flex items-center gap-1.5 text-caption-2 text-grey">
                    From <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} className={dateInput} />
                </label>
                <label className="flex items-center gap-1.5 text-caption-2 text-grey">
                    To <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} className={dateInput} />
                </label>
                {filters.entry && (
                    <button type="button" onClick={() => setFilter("entry", "")} className="h-9 rounded-lg bg-primary px-3 text-caption-1 font-semibold text-white">
                        One entry ×
                    </button>
                )}
                {anyFilter && (
                    <button
                        type="button"
                        onClick={() => {
                            setSearch("");
                            router.replace("/settings/activity");
                        }}
                        className="text-caption-1 text-primary hover:opacity-70"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {error && <div className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>}

            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                    <thead>
                        <tr className="border-b border-grey-light text-caption-2 uppercase tracking-wide text-grey dark:border-grey-light/10">
                            <th className="pb-2 pr-4 font-semibold">When</th>
                            <th className="pb-2 pr-4 font-semibold">Who</th>
                            <th className="pb-2 pr-4 font-semibold">Action</th>
                            <th className="pb-2 pr-4 font-semibold">On</th>
                            <th className="pb-2 font-semibold">IP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows?.map((r) => {
                            const changes = r.metadata?.changes ?? [];
                            const open = openId === r.id;
                            const detail = rowDetail(r);
                            return (
                                <Fragment key={r.id}>
                                    <tr onClick={() => setOpenId(open ? null : r.id)} className="cursor-pointer border-b border-grey-light/60 align-top hover:bg-lavender-mist/40 dark:border-grey-light/5 dark:hover:bg-dark-3/40">
                                        <td className="whitespace-nowrap py-2.5 pr-4 text-grey" suppressHydrationWarning>{new Date(r.createdAt).toLocaleString()}</td>
                                        <td className="py-2.5 pr-4 text-black dark:text-white">
                                            {r.actor?.name ?? "System"}
                                            {r.actor?.role && <span className="block text-caption-2 text-grey">{r.actor.role}</span>}
                                        </td>
                                        <td className="py-2.5 pr-4 text-black dark:text-white">
                                            {actionLabel(r.action)}
                                            {changes.length > 0 && <span className="ml-1.5 text-caption-2 text-grey">({changes.length} field{changes.length === 1 ? "" : "s"})</span>}
                                            {detail && <span className="block text-caption-2 text-grey">{detail}</span>}
                                        </td>
                                        <td className="py-2.5 pr-4">
                                            {r.resource === "ContentEntry" && r.resourceId && r.action !== "content.delete" ? (
                                                <Link href={`/content/editor?id=${r.resourceId}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:opacity-70">
                                                    {r.title || "Untitled"}
                                                </Link>
                                            ) : (
                                                <span className="text-black dark:text-white">{r.title ?? (r.resource === "ContentEntry" ? "Entry" : r.resource)}</span>
                                            )}
                                            {r.slug && <span className="block font-mono text-caption-2 text-grey">{r.entryType ? `${r.entryType}/` : ""}{r.slug}</span>}
                                        </td>
                                        <td className="py-2.5 font-mono text-caption-1 text-grey">{r.ip ?? "—"}</td>
                                    </tr>
                                    {open && (
                                        <tr className="border-b border-grey-light/60 dark:border-grey-light/5">
                                            <td colSpan={5} className="bg-lavender-mist/30 px-3 py-3 dark:bg-dark-3/30">
                                                {changes.length > 0 && <ChangeList changes={changes} />}
                                                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption-2">
                                                    {r.actor?.email && (<><dt className="text-grey">Email</dt><dd className="text-black dark:text-white">{r.actor.email}</dd></>)}
                                                    {r.tokenId && (<><dt className="text-grey">API token</dt><dd className="font-mono text-black dark:text-white">{r.tokenId}</dd></>)}
                                                    {r.userAgent && (<><dt className="text-grey">Browser</dt><dd className="break-all text-black dark:text-white">{r.userAgent}</dd></>)}
                                                    {(r.versionBefore != null || r.versionAfter != null) && (<><dt className="text-grey">Version</dt><dd className="text-black dark:text-white">{r.versionBefore != null ? `v${r.versionBefore}` : "none"} → {r.versionAfter != null ? `v${r.versionAfter}` : "none"}</dd></>)}
                                                    {r.metadata && Object.keys(r.metadata).some((k) => k !== "changes") && (
                                                        <><dt className="text-grey">Details</dt><dd className="break-all font-mono text-black dark:text-white">{JSON.stringify(Object.fromEntries(Object.entries(r.metadata).filter(([k]) => k !== "changes")))}</dd></>
                                                    )}
                                                </dl>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                        {rows && rows.length === 0 && (
                            <tr>
                                <td colSpan={5} className="py-8 text-center text-grey">No activity matches.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 flex justify-center">
                <Pagination
                    page={page}
                    totalPages={Math.ceil(total / PAGE)}
                    onChange={(p) => {
                        const q = query(filters);
                        if (p > 1) q.set("page", String(p));
                        router.replace(`/settings/activity${q.size ? `?${q}` : ""}`);
                    }}
                />
            </div>
            {!has("audit_export") && (
                <div className="mt-4">
                    <UpgradeLock feature="audit_export" icon="download" title="Export the activity log" description="Download the full log, with your filters, as CSV or JSON for retention and your SIEM." />
                </div>
            )}
        </Card>
    );
};

type DeletedItem = { id: string; kind: "entry" | "media"; itemId: string; title: string; detail: string | null; deletedBy: string | null; deletedAt: string; purgeAt: string };

/** Entries and files deleted in the last 30 days, with restore. */
const DeletedItems = () => {
    const { can } = useAuth();
    const [items, setItems] = useState<DeletedItem[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const load = useCallback(() => {
        api<{ items: DeletedItem[] }>("/trash?limit=200")
            .then((r) => setItems(r.items))
            .catch(() => setItems([]));
    }, []);
    useEffect(() => {
        load();
    }, [load]);

    const restore = async (d: DeletedItem) => {
        setBusy(d.id);
        try {
            await api(`/trash/${d.id}/restore`, { method: "POST" });
            void notice({ title: "Restored", message: d.kind === "entry" ? `“${d.title}” is back as a draft. Publish it again when you're ready.` : `“${d.title}” is back in the media library.` });
            load();
        } catch (e) {
            void notice({ title: "Couldn't restore", message: e instanceof ApiError ? e.message : "Please try again.", tone: "danger" });
        } finally {
            setBusy(null);
        }
    };
    const allowed = (d: DeletedItem) => (d.kind === "entry" ? can("content.restore") : can("media.manage"));

    return (
        <Card>
            <h2 className="text-h5 text-black dark:text-white">Deleted items</h2>
            <p className="mt-1 text-caption-2 text-grey">Deleted entries and files stay here for 30 days, then they&apos;re removed for good.</p>
            {items === null ? (
                <p className="py-6 text-center text-caption-1 text-grey">Loading…</p>
            ) : items.length === 0 ? (
                <p className="py-6 text-center text-caption-1 text-grey">Nothing deleted in the last 30 days.</p>
            ) : (
                <ul className="mt-4 flex flex-col">
                    {items.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-3 border-b border-grey-light/60 py-2.5 last:border-b-0 dark:border-grey-light/5">
                            <div className="min-w-0 grow">
                                <div className="truncate text-body-sm text-black dark:text-white">{d.title}</div>
                                <div className="text-caption-2 text-grey" suppressHydrationWarning>
                                    {d.kind === "entry" ? d.detail ?? "Entry" : "File"} · deleted by {d.deletedBy ?? "unknown"} {new Date(d.deletedAt).toLocaleString()} · gone {new Date(d.purgeAt).toLocaleDateString()}
                                </div>
                            </div>
                            {allowed(d) ? (
                                <button type="button" onClick={() => void restore(d)} disabled={busy === d.id} className="btn-secondary h-9 px-3.5 text-caption-1 disabled:opacity-60">
                                    {busy === d.id ? "Restoring…" : "Restore"}
                                </button>
                            ) : (
                                <span className="text-caption-2 text-grey">{d.kind === "entry" ? "Needs the Restore permission" : "Needs media rights"}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

type Settings = { auditRetentionDays: number; alertsEnabled: boolean; alertEmails: string[] };

/** Retention and alerts. */
const ActivitySettings = () => {
    const [s, setS] = useState<Settings | null>(null);
    const [emails, setEmails] = useState("");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        api<Settings>("/activity/settings")
            .then((r) => {
                setS(r);
                setEmails(r.alertEmails.join(", "));
            })
            .catch(() => {});
    }, []);
    if (!s) return null;

    const save = async () => {
        setSaving(true);
        try {
            const r = await api<Settings>("/activity/settings", {
                method: "PATCH",
                body: JSON.stringify({ auditRetentionDays: s.auditRetentionDays, alertsEnabled: s.alertsEnabled, alertEmails: emails.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) }),
            });
            setS(r);
            setEmails(r.alertEmails.join(", "));
            void notice({ title: "Saved", message: "Activity settings updated." });
        } catch (e) {
            void notice({ title: "Couldn't save", message: e instanceof ApiError ? e.message : "Please try again.", tone: "danger" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <h2 className="text-h5 text-black dark:text-white">Retention and alerts</h2>
            <div className="mt-4 flex flex-col gap-4">
                <label className="flex flex-wrap items-center gap-3 text-body-sm text-black dark:text-white">
                    Keep the activity log for
                    <input type="number" min={365} max={3650} value={s.auditRetentionDays} onChange={(e) => setS({ ...s, auditRetentionDays: Number(e.target.value) })} className={cn(dateInput, "w-24")} />
                    days <span className="text-caption-2 text-grey">(at least 365)</span>
                </label>
                <div className="flex items-start gap-3">
                    <Switch checked={s.alertsEnabled} onChange={(v) => setS({ ...s, alertsEnabled: v })} aria-label="Send alerts" />
                    <div>
                        <div className="text-body-sm text-black dark:text-white">Alert on sensitive changes</div>
                        <p className="text-caption-2 text-grey">
                            Publish or unpublish of a live page, slug changes, deletes, restores, role changes and new API tokens. Sent by email to the addresses below and to webhooks subscribed to <code className="font-mono">activity.alert</code>.
                        </p>
                    </div>
                </div>
                <label className="block">
                    <span className="mb-1.5 block text-caption-1 text-black dark:text-white">Alert emails</span>
                    <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ops@example.com, owner@example.com" className="flow-input" />
                </label>
                <div>
                    <button type="button" onClick={save} disabled={saving} className="btn-primary h-9 px-4 text-caption-1 disabled:opacity-60">
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </Card>
    );
};

export default Activity;
