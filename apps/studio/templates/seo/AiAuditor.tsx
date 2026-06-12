"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import ScoreRing from "@/components/ui/ScoreRing";
import CountUp from "@/components/motion/CountUp";
import Switch from "@/components/ui/Switch";
import { api, ApiError } from "@/lib/api";
import { useSeoFixMode, type SeoFixMode } from "@/lib/seoPrefs";
import { usePlan } from "@/components/providers/LicenseProvider";
import { useRevealBatch } from "@/lib/useReveal";

type Finding = {
    code: string;
    task: string;
    severity: 1 | 2 | 3;
    severityLabel: "Critical" | "Warning" | "Minor";
    label: string;
    explanation: string;
    fixHint: string;
    ai: "fix" | "explain" | "none";
};
type PageAudit = {
    entryId: string | null;
    url: string | null;
    title: string | null;
    severity: number;
    escalated: boolean;
    lastCheckedAt: string;
    findings: Finding[];
};
type Suggestion = { task: string; model: string; provider: string; tokensIn: number; tokensOut: number; costUsd: number | null; output: unknown };
type AiResult = { suggestions: Suggestion[]; skipped: { task: string; reason: string }[]; tokensIn: number; tokensOut: number };
type AutoConfig = {
    enabled: boolean;
    editable: boolean;
    config: { incrementalHours: number; fullHours: number; perRunCap: number };
    lastIncrementalScanAt: string | null;
    lastFullScanAt: string | null;
};

const TASK_LABEL: Record<string, string> = {
    meta_title_description: "Meta",
    image_alt_tag: "Alt text",
    schema_audit: "Schema",
    core_web_vitals: "Core Web Vitals",
    onpage_seo_audit: "On-page",
    content_generation: "Content",
    gsc_ga_analysis: "Search analytics",
    technical_diagnosis: "Technical",
};
const SEV_DOT: Record<number, string> = { 3: "bg-error", 2: "bg-amber-500", 1: "bg-grey/50" };
const SEV_PEN: Record<number, number> = { 3: 30, 2: 12, 1: 5 };

function healthColor(n: number) {
    if (n >= 80) return "#0a9d78";
    if (n >= 50) return "#c97a12";
    return "#e5484d";
}
function everyLabel(h: number) {
    if (h <= 1) return "hourly";
    if (h === 24) return "daily";
    if (h === 168) return "weekly";
    if (h % 24 === 0) return `every ${h / 24} days`;
    return `every ${h}h`;
}
function renderOutput(out: unknown): { k: string; v: string }[] {
    if (out && typeof out === "object" && !Array.isArray(out)) {
        const o = out as Record<string, unknown>;
        if ("t" in o || "d" in o) {
            const rows: { k: string; v: string }[] = [];
            if (o.t) rows.push({ k: "Title", v: String(o.t) });
            if (o.d) rows.push({ k: "Description", v: String(o.d) });
            return rows;
        }
        if (Array.isArray(o.s)) return (o.s as unknown[]).map((x, i) => ({ k: `Fix ${i + 1}`, v: String(x) }));
        return Object.entries(o).map(([k, v]) => ({ k, v: typeof v === "string" ? v : JSON.stringify(v) }));
    }
    return [{ k: "Result", v: String(out) }];
}

type SevFilter = "all" | 3 | 2 | 1;

const AiAuditor = () => {
    const { has } = usePlan();
    const [fixMode, setFixMode] = useSeoFixMode();
    const autoUnlocked = has("seo_automation");

    // Scheduled AI auditing (Pro+): real backend config (replaces the old localStorage stub).
    const [auto, setAuto] = useState<AutoConfig | null>(null);
    const [cadence, setCadence] = useState<AutoConfig["config"] | null>(null);
    const [autoSaving, setAutoSaving] = useState(false);
    const [runningNow, setRunningNow] = useState(false);
    const [runMsg, setRunMsg] = useState("");

    const [pages, setPages] = useState<PageAudit[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [aiBusy, setAiBusy] = useState<string | null>(null);
    const [aiResults, setAiResults] = useState<Record<string, AiResult>>({});
    const [filter, setFilter] = useState<SevFilter>("all");

    const scope = useRef<HTMLDivElement>(null);

    const load = async () => {
        try {
            setPages(await api<PageAudit[]>("/seo/scan"));
        } catch {
            setError("Couldn't load audits.");
        } finally {
            setLoaded(true);
        }
    };
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time data fetch on mount
        void load();
    }, []);

    const runAudit = async () => {
        setRunning(true);
        setError("");
        try {
            await api("/seo/scan/run", { method: "POST" });
            await load();
        } catch {
            setError("Couldn't run the audit.");
        } finally {
            setRunning(false);
        }
    };
    const runAi = async (entryId: string) => {
        setAiBusy(entryId);
        setError("");
        try {
            const r = await api<AiResult>(`/seo/scan/ai/${entryId}`, { method: "POST" });
            setAiResults((m) => ({ ...m, [entryId]: r }));
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "AI pass failed.");
        } finally {
            setAiBusy(null);
        }
    };

    // Load the scheduled-AI config (Pro+ only; gated endpoint 403s on Community).
    useEffect(() => {
        if (!autoUnlocked) return;
        void api<AutoConfig>("/ee/seo-automation")
            .then((cfg) => {
                setAuto(cfg);
                setCadence(cfg.config);
            })
            .catch(() => {});
    }, [autoUnlocked]);

    const toggleAuto = async (next: boolean) => {
        if (!auto) return;
        setAuto({ ...auto, enabled: next }); // optimistic
        setAutoSaving(true);
        try {
            setAuto(await api<AutoConfig>("/ee/seo-automation", { method: "PUT", body: JSON.stringify({ enabled: next }) }));
        } catch {
            setAuto((a) => (a ? { ...a, enabled: !next } : a)); // revert
        } finally {
            setAutoSaving(false);
        }
    };

    const runNow = async () => {
        setRunningNow(true);
        setRunMsg("");
        try {
            const r = await api<{ passed: number; tokensOut: number; scanned: number; stoppedForBudget: boolean }>("/ee/seo-automation/run", { method: "POST" });
            setRunMsg(
                r.passed === 0
                    ? "Nothing to do: no changed, flagged pages."
                    : `Audited ${r.passed} page${r.passed > 1 ? "s" : ""}, ${r.tokensOut} output tokens${r.stoppedForBudget ? " (stopped: budget cap)" : ""}.`,
            );
            await load();
            setAuto(await api<AutoConfig>("/ee/seo-automation"));
        } catch (e) {
            setRunMsg(e instanceof ApiError ? e.message : "Run failed.");
        } finally {
            setRunningNow(false);
        }
    };

    const saveCadence = async () => {
        if (!cadence) return;
        setAutoSaving(true);
        try {
            const r = await api<AutoConfig>("/ee/seo-automation", { method: "PUT", body: JSON.stringify(cadence) });
            setAuto(r);
            setCadence(r.config);
        } catch {
            /* keep draft */
        } finally {
            setAutoSaving(false);
        }
    };

    const { totalIssues, sev, health, fixable, clean } = useMemo(() => {
        const counts = { 3: 0, 2: 0, 1: 0 };
        let issues = 0;
        let scoreSum = 0;
        for (const p of pages) {
            let pen = 0;
            for (const f of p.findings) {
                counts[f.severity]++;
                issues++;
                pen += SEV_PEN[f.severity];
            }
            scoreSum += Math.max(0, 100 - Math.min(100, pen));
        }
        return {
            totalIssues: issues,
            sev: counts,
            health: pages.length ? Math.round(scoreSum / pages.length) : 100,
            fixable: pages.filter((p) => p.escalated).length,
            clean: pages.filter((p) => p.findings.length === 0).length,
        };
    }, [pages]);

    const shown = useMemo(() => {
        if (filter === "all") return pages;
        return pages.filter((p) => p.findings.some((f) => f.severity === filter));
    }, [pages, filter]);

    useRevealBatch(scope, ".reveal-up", [loaded, filter, pages.length]);

    return (
        <div ref={scope} className="flex flex-col gap-6">
            {/* ---------- hero: score + stats + run ---------- */}
            <Card reveal={false} className="overflow-hidden !p-0">
                <div className="flex flex-col items-center gap-6 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent p-6 sm:flex-row sm:items-center">
                    <ScoreRing value={health} size={112} color={healthColor(health)} label="Health" />
                    <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
                        <Stat label="Pages audited" value={pages.length} />
                        <Stat label="Issues found" value={totalIssues} />
                        <Stat label="AI-fixable" value={fixable} accent="text-primary" />
                        <Stat label="Clean" value={clean} accent="text-success" />
                    </div>
                    <button type="button" onClick={() => void runAudit()} disabled={running} className="btn-primary btn-md shrink-0 gap-2 disabled:opacity-60">
                        <Icon name="search" className="h-4 w-4 fill-white" />
                        {running ? "Scanning…" : "Run audit"}
                    </button>
                </div>
            </Card>

            {/* ---------- settings (two clean cards, no overlay) ---------- */}
            <div className="grid items-stretch gap-4 md:grid-cols-2">
                {/* fix application mode */}
                <Card reveal={false} className="!p-5">
                    <div className="mb-1.5 flex items-center gap-2">
                        <Icon name="check" className="h-4 w-4 fill-primary" />
                        <h3 className="text-title text-black dark:text-white">Fix application</h3>
                    </div>
                    <p className="mb-3 text-caption-2 text-grey">How Flow CMS applies the fixes it suggests.</p>
                    <div className="inline-flex rounded-xl border border-grey-light p-1 dark:border-grey-light/10">
                        {(["review", "auto"] as SeoFixMode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setFixMode(m)}
                                className={`rounded-lg px-3 py-1.5 text-caption-1 transition-colors ${
                                    fixMode === m ? "bg-primary text-white shadow-glow" : "text-grey hover:text-primary"
                                }`}
                            >
                                {m === "review" ? "Review first" : "Auto-apply safe"}
                            </button>
                        ))}
                    </div>
                </Card>

                {/* automatic AI auditing — real Pro+ scheduler (no overlay) */}
                <Card reveal={false} className="!p-5">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Icon name="sparkles" className="h-4 w-4 fill-primary" />
                            <h3 className="text-title text-black dark:text-white">Automatic AI auditing</h3>
                            {!autoUnlocked && (
                                <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-primary dark:text-lilac">Pro</span>
                            )}
                        </div>
                        {autoUnlocked && <Switch checked={!!auto?.enabled} onChange={toggleAuto} />}
                    </div>
                    {autoUnlocked ? (
                        auto ? (
                            <>
                                <p className="text-caption-2 text-grey">
                                    {auto.enabled
                                        ? "On. AI re-checks changed, flagged pages on a schedule, within your budget."
                                        : "Off. Deterministic checks still run free; AI runs only when you click."}
                                </p>
                                <p className="mt-2 text-caption-2 text-grey/80">
                                    Cadence: {everyLabel(auto.config.incrementalHours)} incremental, {everyLabel(auto.config.fullHours)} full.
                                    {(auto.lastIncrementalScanAt || auto.lastFullScanAt) &&
                                        ` Last run ${new Date((auto.lastIncrementalScanAt ?? auto.lastFullScanAt)!).toLocaleString()}.`}
                                </p>

                                {auto.editable && cadence && (
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        <CadenceInput label="Incremental (h)" value={cadence.incrementalHours} min={1} max={720} onChange={(v) => setCadence({ ...cadence, incrementalHours: v })} />
                                        <CadenceInput label="Full (h)" value={cadence.fullHours} min={24} max={2160} onChange={(v) => setCadence({ ...cadence, fullHours: v })} />
                                        <CadenceInput label="Pages/run" value={cadence.perRunCap} min={1} max={500} onChange={(v) => setCadence({ ...cadence, perRunCap: v })} />
                                    </div>
                                )}

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {auto.enabled && (
                                        <button type="button" onClick={() => void runNow()} disabled={runningNow} className="btn-secondary btn-sm gap-1.5 disabled:opacity-60">
                                            <Icon name="sparkles" className="h-4 w-4 fill-primary" />
                                            {runningNow ? "Running…" : "Run now"}
                                        </button>
                                    )}
                                    {auto.editable && cadence && (
                                        <button type="button" onClick={() => void saveCadence()} disabled={autoSaving} className="btn-ghost btn-sm disabled:opacity-60">
                                            {autoSaving ? "Saving…" : "Save cadence"}
                                        </button>
                                    )}
                                </div>
                                {runMsg && <p className="mt-2 text-caption-2 text-grey">{runMsg}</p>}
                            </>
                        ) : (
                            <p className="text-caption-2 text-grey">Loading…</p>
                        )
                    ) : (
                        <>
                            <p className="text-caption-2 text-grey">
                                Run the AI pass automatically on a cadence, within your budget. Deterministic checks already run free.
                            </p>
                            <Link href="/settings/plan" className="btn-secondary btn-sm mt-3 gap-1.5">
                                <Icon name="sparkles" className="h-4 w-4 fill-primary" />
                                Upgrade to Pro
                            </Link>
                        </>
                    )}
                </Card>
            </div>

            {/* related controls */}
            <div className="-mt-2 flex flex-wrap gap-x-6 gap-y-2">
                <Link href="/ai/usage" className="flex items-center gap-1.5 text-caption-2 text-grey transition-colors hover:text-primary">
                    <Icon name="chart" className="h-3.5 w-3.5 fill-current" /> AI spend cap
                </Link>
                <Link href="/settings/integrations" className="flex items-center gap-1.5 text-caption-2 text-grey transition-colors hover:text-primary">
                    <Icon name="settings" className="h-3.5 w-3.5 fill-current" /> AI providers
                </Link>
            </div>

            {/* ---------- audit report ---------- */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-poppins text-h5 font-semibold text-black dark:text-white">Audit report</h2>
                <div className="flex flex-wrap gap-1.5">
                    <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={pages.length} />
                    <FilterChip active={filter === 3} onClick={() => setFilter(3)} label="Critical" count={sev[3]} dot="bg-error" />
                    <FilterChip active={filter === 2} onClick={() => setFilter(2)} label="Warning" count={sev[2]} dot="bg-amber-500" />
                    <FilterChip active={filter === 1} onClick={() => setFilter(1)} label="Minor" count={sev[1]} dot="bg-grey/50" />
                </div>
            </div>

            <p className="-mt-2 text-caption-1 text-grey">
                Deterministic checks run automatically and cost nothing. &ldquo;Suggest fixes with AI&rdquo; routes to the cheapest
                capable model your plan allows and returns compact suggestions to review.
            </p>

            {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-caption-1 text-error">{error}</p>}

            {!loaded ? (
                <Card className="text-body-sm text-grey">Loading audits…</Card>
            ) : shown.length === 0 ? (
                <Card className="flex flex-col items-center gap-2 py-10 text-center">
                    <Icon name="check" className="h-8 w-8 fill-success" />
                    <p className="text-body-sm text-black dark:text-white">{pages.length === 0 ? "No audits yet." : "Nothing in this filter."}</p>
                    <p className="text-caption-2 text-grey">{pages.length === 0 ? "Click “Run audit” to scan your published pages." : "Switch the filter to see other findings."}</p>
                </Card>
            ) : (
                shown.map((p) => {
                    const findings = filter === "all" ? p.findings : p.findings.filter((f) => f.severity === filter);
                    const ai = aiResults[p.entryId ?? ""];
                    const worst = Math.max(0, ...p.findings.map((f) => f.severity));
                    return (
                        <Card key={p.entryId ?? p.url ?? ""} reveal={false} className="reveal-up !p-5 transition-transform duration-200 hover:-translate-y-0.5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${SEV_DOT[worst] ?? "bg-success"}`} />
                                    <div className="min-w-0">
                                        <h3 className="truncate font-poppins text-body font-semibold text-black dark:text-white">{p.title ?? "Untitled"}</h3>
                                        <p className="mt-0.5 text-caption-2 text-grey">
                                            {p.findings.length === 0 ? "No issues" : `${p.findings.length} issue${p.findings.length > 1 ? "s" : ""}`} · last checked {new Date(p.lastCheckedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                {p.escalated && p.entryId && (
                                    <button type="button" onClick={() => void runAi(p.entryId!)} disabled={aiBusy === p.entryId} className="btn-secondary btn-sm shrink-0 gap-1.5 disabled:opacity-60">
                                        <Icon name="sparkles" className="h-4 w-4 fill-primary" />
                                        {aiBusy === p.entryId ? "Thinking…" : "Suggest fixes with AI"}
                                    </button>
                                )}
                            </div>

                            {findings.length > 0 && (
                                <ul className="mt-4 flex flex-col gap-2.5 pl-5">
                                    {findings.map((f, i) => (
                                        <li key={`${f.code}-${i}`} className="flex gap-3">
                                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[f.severity]}`} />
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-body-sm font-medium text-black dark:text-white">{f.label}</span>
                                                    <span className="rounded-md bg-lavender-mist px-1.5 py-0.5 text-caption-2 text-grey dark:bg-dark-3">{TASK_LABEL[f.task] ?? f.task}</span>
                                                    {f.ai !== "none" && <span className="text-caption-2 text-primary">AI can {f.ai}</span>}
                                                </div>
                                                <p className="mt-0.5 text-caption-1 text-grey">{f.explanation}</p>
                                                <p className="mt-0.5 text-caption-2 text-grey/80">Fix: {f.fixHint}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {ai && (
                                <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
                                    <div className="flex items-center gap-2 text-caption-1 font-semibold text-primary">
                                        <Icon name="sparkles" className="h-4 w-4 fill-primary" /> AI suggestions (review before applying)
                                    </div>
                                    {ai.suggestions.length === 0 && (
                                        <p className="mt-2 text-caption-2 text-grey">
                                            No suggestions returned.{" "}
                                            {ai.skipped.length > 0 && `Skipped: ${ai.skipped.map((s) => `${TASK_LABEL[s.task] ?? s.task} (${s.reason})`).join(", ")}.`}
                                        </p>
                                    )}
                                    {ai.suggestions.map((s, i) => (
                                        <div key={i} className="mt-3 border-t border-primary/10 pt-3 first:mt-2 first:border-t-0 first:pt-0">
                                            <div className="text-caption-2 text-grey">
                                                {TASK_LABEL[s.task] ?? s.task} · via {s.model} ({s.provider}) · {s.tokensOut} output tokens{s.costUsd != null && ` · $${s.costUsd.toFixed(4)}`}
                                            </div>
                                            <dl className="mt-1.5 flex flex-col gap-1.5">
                                                {renderOutput(s.output).map((row, j) => (
                                                    <div key={j} className="text-body-sm">
                                                        <dt className="inline font-medium text-black dark:text-white">{row.k}: </dt>
                                                        <dd className="inline text-grey dark:text-dark-text">{row.v}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    );
                })
            )}
        </div>
    );
};

const Stat = ({ label, value, accent }: { label: string; value: number; accent?: string }) => (
    <div>
        <CountUp value={value} className={`font-poppins text-h3 font-bold ${accent ?? "text-black dark:text-white"}`} />
        <div className="text-caption-2 text-grey">{label}</div>
    </div>
);

const CadenceInput = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) => (
    <label className="flex flex-col gap-1">
        <span className="text-[0.625rem] uppercase tracking-wide text-grey">{label}</span>
        <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || min))))}
            className="flow-input h-8 px-2 text-caption-1"
        />
    </label>
);

const FilterChip = ({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption-1 transition-colors ${
            active ? "bg-primary text-white shadow-glow" : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3"
        }`}
    >
        {dot && <span className={`h-2 w-2 rounded-full ${active ? "bg-white/80" : dot}`} />}
        {label}
        <span className={active ? "text-white/80" : "text-grey/70"}>{count}</span>
    </button>
);

export default AiAuditor;
