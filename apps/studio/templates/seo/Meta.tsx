"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import CountUp from "@/components/motion/CountUp";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import LiveBadge from "./LiveBadge";
import AutoFixModal from "./AutoFixModal";

const titleOk = (n: number) => n >= 30 && n <= 60;
const descOk = (n: number) => n >= 70 && n <= 160;

type MetaRow = { id: string; path: string; title: string; titleLen: number; descLen: number; schema: string; issues: string[]; description?: string };
type AuditLive = { hasData: boolean; metaRows?: MetaRow[] };

/**
 * Meta + Schema — audit titles, descriptions and schema coverage. Live from the
 * crawler; per-row AI auto-fix generates an optimized title + description.
 */
const Meta = () => {
    const [live, setLive] = useState<AuditLive | null>(null);
    const [loading, setLoading] = useState(true);
    const [fixPage, setFixPage] = useState<{ path: string; title: string; description?: string } | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<AuditLive>("/seo/audit")
            .then((d) => setLive(d.hasData && d.metaRows ? d : null))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const isLive = !!live;
    const rows: MetaRow[] = isLive ? live!.metaRows! : [];
    const withIssues = rows.filter((r) => r.issues.length > 0).length;
    const noSchema = rows.filter((r) => r.schema === "—").length;

    const COLS = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,2.2fr)_4.5rem_4.5rem_minmax(0,1fr)_7rem]";

    if (!isLive) {
        return (
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-2.5">
                    <h2 className="text-h5 text-black dark:text-white">Meta &amp; schema audit</h2>
                    <LiveBadge live={false} source="Crawler" />
                    {loading && <span className="text-caption-2 text-grey">Crawling your pages…</span>}
                </div>
                {!loading && (
                    <EmptyState
                        icon="search"
                        title="No scan yet"
                        description="Run a scan to audit your meta titles and descriptions."
                        action={{ label: "Run a scan", href: "/seo/optimizer" }}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2.5">
                <h2 className="text-h5 text-black dark:text-white">Meta &amp; schema audit</h2>
                <LiveBadge live={isLive} source="Crawler" />
                {loading && <span className="text-caption-2 text-grey">Crawling your pages…</span>}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat value={rows.length} label="Pages audited" color="#6C5CE7" />
                <Stat value={withIssues} label="With issues" color="#E24B4A" />
                <Stat value={noSchema} label="Missing schema" color="#F5A623" />
                <Stat value={rows.length - withIssues} label="Clean" color="#00B894" />
            </div>

            <Card className="!p-0 overflow-hidden">
                {/* header — alignment matches the row cells exactly */}
                <div className={cn("hidden lg:grid gap-4 px-5 py-3 border-b border-grey-light text-caption-2 text-grey dark:border-grey-light/10", COLS)}>
                    <span>Page</span>
                    <span>Title</span>
                    <span className="text-right">Title len</span>
                    <span className="text-right">Desc len</span>
                    <span>Schema</span>
                    <span className="text-right">Fix</span>
                </div>
                {rows.map((r) => (
                    <div
                        key={r.id}
                        className={cn(
                            "grid grid-cols-1 items-center gap-x-4 gap-y-2 px-5 py-4 border-b border-grey-light last:border-b-0 dark:border-grey-light/10 lg:gap-y-1",
                            COLS,
                        )}
                    >
                        <div className="min-w-0">
                            <div className="truncate text-title text-black dark:text-white">{r.path}</div>
                            {r.issues.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    {r.issues.map((iss) => (
                                        <span key={iss} className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-[0.6875rem] font-medium text-warning">
                                            <Icon className="h-3 w-3 fill-warning" name="clock" />
                                            {iss}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <span className="truncate text-body-sm text-grey">{r.title}</span>
                        <LenChip n={r.titleLen} ok={titleOk(r.titleLen)} />
                        <LenChip n={r.descLen} ok={descOk(r.descLen)} />
                        <span className="truncate text-body-sm text-black dark:text-white">
                            {r.schema === "—" ? <span className="text-grey">No schema</span> : r.schema}
                        </span>
                        <div className="lg:justify-self-end">
                            {r.issues.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setFixPage({ path: r.path, title: r.title === "(none)" ? "" : r.title, description: r.description })}
                                    className="btn-primary btn-sm"
                                >
                                    <Icon className="h-3.5 w-3.5 fill-white" name="sparkles" />
                                    Fix with AI
                                </button>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-caption-2 font-semibold text-success">
                                    <Icon className="h-4 w-4 fill-success" name="check" />
                                    Clean
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </Card>

            <AutoFixModal open={!!fixPage} onClose={() => setFixPage(null)} mode="meta" page={fixPage} />
        </div>
    );
};

const Stat = ({ value, label, color }: { value: number; label: string; color: string }) => (
    <Card className="!p-5">
        <div className="font-poppins text-h3 font-extrabold" style={{ color }}>
            <CountUp value={value} />
        </div>
        <div className="mt-1 text-caption-2 text-grey">{label}</div>
    </Card>
);

const LenChip = ({ n, ok }: { n: number; ok: boolean }) => {
    const color = n === 0 ? "#E24B4A" : ok ? "#00B894" : "#F5A623";
    return (
        <span
            className="inline-flex w-fit items-center justify-center rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold lg:justify-self-end"
            style={{ backgroundColor: `${color}1a`, color }}
        >
            {n === 0 ? "missing" : <CountUp value={n} />}
        </span>
    );
};

export default Meta;
