"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import CountUp from "@/components/motion/CountUp";
import EmptyState from "@/components/ui/EmptyState";
import { jsonLdSample } from "@/mocks/seo";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import LiveBadge from "./LiveBadge";
import AutoFixModal from "./AutoFixModal";

type JsonLdRow = { id: string; path: string; type: string; valid: boolean; richResult: boolean };
type AuditLive = { hasData: boolean; jsonLdRows?: JsonLdRow[] };

/**
 * JSON-LD — structured-data coverage across the site: which schema types are live
 * per page, validation status, and rich-result eligibility. Live from the crawler.
 */
const JsonLd = () => {
    const [live, setLive] = useState<AuditLive | null>(null);
    const [loading, setLoading] = useState(true);
    const [genPage, setGenPage] = useState<{ path: string; title: string } | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<AuditLive>("/seo/audit")
            .then((d) => setLive(d.hasData && d.jsonLdRows ? d : null))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const isLive = !!live;
    const rows: JsonLdRow[] = isLive ? live!.jsonLdRows! : [];
    const withSchema = rows.filter((r) => r.type !== "—").length;
    const valid = rows.filter((r) => r.valid && r.type !== "—").length;
    const rich = rows.filter((r) => r.richResult).length;

    if (!isLive) {
        return (
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-2.5">
                    <h2 className="text-h5 text-black dark:text-white">Structured data (JSON-LD)</h2>
                    <LiveBadge live={false} source="Crawler" />
                    {loading && <span className="text-caption-2 text-grey">Crawling your pages…</span>}
                </div>
                {!loading && (
                    <EmptyState
                        icon="search"
                        title="No scan yet"
                        description="Run a scan to audit your structured data."
                        action={{ label: "Run a scan", href: "/seo/optimizer" }}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2.5">
                <h2 className="text-h5 text-black dark:text-white">Structured data (JSON-LD)</h2>
                <LiveBadge live={isLive} source="Crawler" />
                {loading && <span className="text-caption-2 text-grey">Crawling your pages…</span>}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat value={withSchema} label="Pages with schema" color="#6C5CE7" />
                <Stat value={valid} label="Valid" color="#00B894" />
                <Stat value={withSchema - valid} label="Errors" color="#E24B4A" />
                <Stat value={rich} label="Rich-result eligible" color="#3B82F6" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
                <Card className="!p-0 overflow-hidden">
                    <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_4.5rem_5rem_6.5rem] gap-4 px-5 py-3 border-b border-grey-light text-caption-2 text-grey dark:border-grey-light/10">
                        <span>Page</span>
                        <span>Schema type</span>
                        <span className="text-center">Valid</span>
                        <span className="text-center">Rich result</span>
                        <span className="text-right">Action</span>
                    </div>
                    {rows.map((r) => (
                        <div
                            key={r.id}
                            className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_4.5rem_5rem_6.5rem] items-center gap-x-4 gap-y-1 px-5 py-3.5 border-b border-grey-light last:border-b-0 dark:border-grey-light/10"
                        >
                            <span className="truncate text-title text-black dark:text-white">{r.path}</span>
                            <span className="hidden truncate text-body-sm text-grey sm:block">{r.type === "—" ? <span className="text-grey">No schema</span> : r.type}</span>
                            <span className="hidden sm:flex sm:justify-center">
                                {r.type === "—" ? (
                                    <span className="text-caption-2 text-grey">—</span>
                                ) : (
                                    <Badge ok={r.valid} okLabel="Valid" badLabel="Error" />
                                )}
                            </span>
                            <span className="hidden sm:flex sm:justify-center">
                                {r.richResult ? (
                                    <Icon className="w-5 h-5 fill-success" name="check" />
                                ) : (
                                    <span className="text-caption-2 text-grey">—</span>
                                )}
                            </span>
                            <button
                                type="button"
                                onClick={() => setGenPage({ path: r.path, title: r.path })}
                                className="btn-secondary h-8 px-3 text-caption-2 sm:justify-self-end"
                            >
                                <Icon className="h-3.5 w-3.5 fill-primary dark:fill-lilac" name="sparkles" />
                                {r.type === "—" ? "Generate" : "Redo"}
                            </button>
                        </div>
                    ))}
                </Card>

                <Card className="flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-h5 text-black dark:text-white">Reference payload</h2>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-lavender-mist text-primary text-[0.6875rem] font-semibold dark:bg-dark-3 dark:text-lilac">
                            Template
                        </span>
                    </div>
                    <p className="mb-3 text-caption-2 text-grey">
                        A starter BlogPosting block: add it per page from the editor&rsquo;s Schema panel.
                    </p>
                    <pre className="grow rounded-2xl bg-ink p-4 text-caption-2 leading-relaxed text-lilac overflow-x-auto scrollbar-thin">
                        {jsonLdSample}
                    </pre>
                    <a
                        href="https://search.google.com/test/rich-results"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary w-full mt-4"
                    >
                        <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="external" />
                        Test in Rich Results
                    </a>
                </Card>
            </div>

            <AutoFixModal open={!!genPage} onClose={() => setGenPage(null)} mode="schema" page={genPage} />
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

const Badge = ({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) => (
    <span
        className={cn(
            "inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-md text-[0.6875rem] font-semibold",
            ok ? "bg-success/15 text-success" : "bg-error/10 text-error",
        )}
    >
        <Icon className={cn("w-3 h-3", ok ? "fill-success" : "fill-error")} name={ok ? "check" : "close"} />
        {ok ? okLabel : badLabel}
    </span>
);

export default JsonLd;
