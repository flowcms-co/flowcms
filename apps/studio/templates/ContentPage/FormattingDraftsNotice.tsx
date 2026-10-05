"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { confirm } from "@/components/providers/ConfirmProvider";
import { useAuth } from "@/components/providers/AuthProvider";

type Draft = { id: string; title: string; type: string };

/** What the notice says for `n` formatting-only drafts. */
export const formattingDraftsMessage = (n: number) =>
    `${n} published ${n === 1 ? "entry has" : "entries have"} unpublished changes that nobody typed: an earlier version of the editor re-wrote ${n === 1 ? "its" : "their"} formatting when ${n === 1 ? "it was" : "they were"} opened, and marked links to your own pages nofollow. Publishing ${n === 1 ? "it" : "them"} would ship that. The text is the same as the live version.`;

/**
 * One-off repair, shown on the Content page only while there is something to
 * repair: pending drafts whose only difference from the live version is editor
 * formatting. Discarding them leaves the live pages exactly as they are.
 */
const FormattingDraftsNotice = () => {
    const { can } = useAuth();
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState<string | null>(null);

    useEffect(() => {
        api<Draft[]>("/entries/drafts/formatting-only").then((d) => setDrafts(Array.isArray(d) ? d : [])).catch(() => {});
    }, []);

    const discard = async () => {
        const names = drafts.slice(0, 8).map((d) => `• ${d.title}`).join("\n") + (drafts.length > 8 ? `\n…and ${drafts.length - 8} more` : "");
        if (!(await confirm({ title: `Discard ${drafts.length} formatting-only draft${drafts.length === 1 ? "" : "s"}?`, message: `The live pages stay exactly as they are. Drafts with real edits are not touched.\n\n${names}`, confirmLabel: "Discard", tone: "danger" }))) return;
        setBusy(true);
        try {
            const r = await api<{ discarded: number }>("/entries/drafts/formatting-only/discard", { method: "POST" });
            setDrafts([]);
            setDone(`Discarded ${r.discarded} draft${r.discarded === 1 ? "" : "s"}.`);
        } catch (e) {
            setDone(e instanceof ApiError ? e.message : "Couldn't discard the drafts.");
        } finally {
            setBusy(false);
        }
    };

    if (done) return <p role="status" className="mb-4 rounded-xl bg-grey-light/50 px-4 py-2.5 text-caption-1 text-black dark:bg-dark-3 dark:text-white">{done}</p>;
    if (!drafts.length) return null;
    return (
        <div role="alert" className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-warning/40 bg-warning/[0.08] p-3.5">
            <span className="text-caption-1 leading-relaxed text-black dark:text-white">{formattingDraftsMessage(drafts.length)}</span>
            {can("content.update") && (
                <button type="button" onClick={() => void discard()} disabled={busy} className="btn-secondary btn-sm shrink-0 disabled:opacity-60">
                    {busy ? "Discarding…" : "Discard these drafts"}
                </button>
            )}
        </div>
    );
};

export default FormattingDraftsNotice;
