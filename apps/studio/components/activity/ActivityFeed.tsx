"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { actionLabel, type ActivityRow } from "@/lib/activity";
import { useAuth } from "@/components/providers/AuthProvider";
import ChangeList from "@/components/activity/ChangeList";

const PAGE = 30;

/** Reason, note, version and status details a row carries besides its diff. */
export const rowDetail = (r: ActivityRow): string | null => {
    const m = (r.metadata ?? {}) as { reason?: string; note?: string; fromVersion?: number; mode?: string; denied?: boolean; fields?: string[]; from?: string; to?: string };
    const bits: string[] = [];
    if (m.denied) bits.push("refused");
    if (m.fromVersion) bits.push(`from v${m.fromVersion}${m.mode === "publish" ? ", published" : m.mode === "draft" ? ", as draft" : ""}`);
    if (m.fields?.length) bits.push(`fields: ${m.fields.join(", ")}`);
    if (r.versionAfter) bits.push(`v${r.versionAfter}`);
    if (m.reason) bits.push(`“${m.reason}”`);
    if (m.note) bits.push(`“${m.note}”`);
    return bits.length ? bits.join(" · ") : null;
};

/** One entry's activity, newest first: who did what, when, and the field diff. */
const ActivityFeed = ({ entryId }: { entryId: string }) => {
    const { can } = useAuth();
    const [rows, setRows] = useState<ActivityRow[] | null>(null);
    const [total, setTotal] = useState(0);
    const [openId, setOpenId] = useState<string | null>(null);

    const load = useCallback(
        async (offset = 0) => {
            const page = await api<{ items: ActivityRow[]; total: number }>(`/entries/${entryId}/activity?limit=${PAGE}&offset=${offset}`).catch(() => ({ items: [], total: 0 }));
            setRows((prev) => (offset && prev ? [...prev, ...page.items] : page.items));
            setTotal(page.total);
        },
        [entryId],
    );
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on entry change
        void load();
    }, [load]);

    if (rows === null) return <p className="py-6 text-center text-caption-2 text-grey">Loading…</p>;
    if (!rows.length) return <p className="py-6 text-center text-caption-2 text-grey">No activity recorded yet.</p>;

    return (
        <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3">
                {rows.map((r) => {
                    const changes = r.metadata?.changes ?? [];
                    const detail = rowDetail(r);
                    return (
                        <li key={r.id} className="flex flex-col gap-1">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-body-sm text-black dark:text-white">
                                    <b className="font-semibold">{r.actor?.name ?? "System"}</b> {actionLabel(r.action).toLowerCase()}
                                </span>
                                <span className="shrink-0 text-[0.6875rem] text-grey" suppressHydrationWarning>{new Date(r.createdAt).toLocaleString()}</span>
                            </div>
                            {(detail || r.ip) && (
                                <div className="text-caption-2 text-grey">
                                    {detail}
                                    {r.ip && <span className="font-mono">{detail ? " · " : ""}{r.ip}</span>}
                                </div>
                            )}
                            {changes.length > 0 &&
                                (openId === r.id ? (
                                    <ChangeList changes={changes} />
                                ) : (
                                    <button type="button" onClick={() => setOpenId(r.id)} className="self-start text-caption-2 text-primary hover:opacity-70">
                                        Show {changes.length} change{changes.length === 1 ? "" : "s"}
                                    </button>
                                ))}
                        </li>
                    );
                })}
            </ul>
            {rows.length < total && (
                <button type="button" onClick={() => void load(rows.length)} className="btn-secondary h-9 text-caption-1">
                    Load more
                </button>
            )}
            {can("security.manage") && (
                <Link href={`/settings/activity?entry=${entryId}`} className="text-caption-2 text-primary hover:opacity-70">
                    Open in Settings › Activity
                </Link>
            )}
        </div>
    );
};

export default ActivityFeed;
