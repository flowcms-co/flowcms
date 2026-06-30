"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlan } from "@/components/providers/LicenseProvider";
import { PLAN_LABEL, PLAN_RANK, PLANS, type Plan } from "@/lib/plans";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.flowcms.co";
const SALES_EMAIL = "sales@flowcms.co";

/** The vendor's public pricing feed (admin /api/pricing). */
type PricingFeed = {
    currency: string;
    pro: { monthly: number; annual: number };
    enterprise: { custom: boolean; monthly?: number; annual?: number };
    seat?: { included: number; monthly: number; annual: number };
    checkout?: boolean;
};

const money = (n: number, currency: string, frac = 0): string => {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: frac }).format(n);
    } catch {
        return `${currency} ${n}`;
    }
};

/**
 * Live plan pricing from the vendor console. Returns formatted Pro/Enterprise labels for the
 * comparison cards, plus the raw feed (seats, annual, and whether self-serve checkout is wired)
 * for the upgrade dialog. It's a plain client fetch, so it's always fresh — no caching to bust.
 */
function useLivePricing() {
    const [feed, setFeed] = useState<PricingFeed | null>(null);
    useEffect(() => {
        let on = true;
        (async () => {
            try {
                const res = await fetch(`${ADMIN_URL}/api/pricing`);
                if (!res.ok) return;
                const p = (await res.json()) as PricingFeed;
                if (on) setFeed(p);
            } catch {
                /* keep the static labels if the feed is unreachable */
            }
        })();
        return () => { on = false; };
    }, []);
    const pro = feed ? money(feed.pro.monthly, feed.currency) : undefined;
    const enterprise = feed && feed.enterprise.custom === false && feed.enterprise.monthly != null ? money(feed.enterprise.monthly, feed.currency) : undefined;
    return { pro, enterprise, feed };
}

/**
 * Billing — compare editions and upgrade. Flow CMS is self-hosted; Pro is sold self-serve via
 * Stripe Checkout (the studio bounces to Stripe and back, and the paid license arrives on the next
 * heartbeat — nudged immediately on return). Enterprise is custom-priced, so it routes to sales.
 * Managing an existing subscription (seats, plan change, card, cancel) lives in BillingPortal;
 * pasting an offline key lives in License.
 */
const Billing = () => {
    const { info, plan, refresh } = usePlan();
    const { can } = useAuth();
    const canManage = can("security.manage");
    const currentRank = PLAN_RANK[plan];
    const livePrice = useLivePricing();
    const feed = livePrice.feed;
    const checkoutReady = !!(feed?.checkout && canManage);

    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [activation, setActivation] = useState<null | "working" | "done" | "pending" | "canceled">(null);

    // Returning from Stripe Checkout (success_url is .../settings/plan?checkout=success): nudge a
    // heartbeat so the freshly minted license is pulled now instead of up to 12h later, then
    // refresh the plan in the UI. Strip the query param so a manual refresh doesn't re-run this.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const status = params.get("checkout");
        if (!status) return;
        params.delete("checkout");
        params.delete("session_id");
        window.history.replaceState({}, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
        if (status === "cancel") {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActivation("canceled");
            return;
        }
        if (status === "success") {
            setActivation("working");
            (async () => {
                // The Stripe webhook mints the license server-side moments after payment. Poll a few
                // heartbeats so it's pulled and applied here without a manual refresh; if it hasn't
                // landed in time, show an honest "activating shortly" rather than a false success.
                let upgraded = false;
                for (let i = 0; i < 5 && !upgraded; i++) {
                    try {
                        await api("/telemetry/beat", { method: "POST" });
                        const info = await api<{ plan?: string }>("/license");
                        upgraded = info?.plan === "pro" || info?.plan === "enterprise";
                    } catch {
                        /* keep trying — the scheduled heartbeat is the backstop */
                    }
                    if (!upgraded) await new Promise((r) => setTimeout(r, 2500));
                }
                await refresh().catch(() => undefined);
                setActivation(upgraded ? "done" : "pending");
            })();
        }
    }, [refresh]);

    return (
        <div className="flex flex-col gap-6">
            {/* Post-checkout activation banner */}
            {activation && activation !== "canceled" && (
                <Card className="border border-primary/30 bg-primary/[0.06]">
                    <div className="flex items-center gap-3">
                        <Icon name={activation === "done" ? "check" : "sparkles"} className="h-5 w-5 shrink-0 fill-primary dark:fill-lilac" />
                        <div>
                            <div className="text-title font-semibold text-black dark:text-white">
                                {activation === "done" ? "You're on Pro." : activation === "pending" ? "Payment received." : "Activating your plan…"}
                            </div>
                            <p className="text-caption-1 text-grey">
                                {activation === "done"
                                    ? "Payment received and your license is active. Pro features are unlocked."
                                    : activation === "pending"
                                      ? "Your license is being issued and will activate within a few minutes — no action needed. Refresh this page if it doesn't appear shortly."
                                      : "Confirming your payment and applying your license. This takes a moment."}
                            </p>
                        </div>
                    </div>
                </Card>
            )}
            {activation === "canceled" && (
                <Card className="border border-grey-light dark:border-grey-light/10">
                    <p className="text-caption-1 text-grey">Checkout canceled — no charge was made. You can upgrade any time below.</p>
                </Card>
            )}

            {/* Current plan */}
            <Card
                className={
                    plan === "community"
                        ? ""
                        : "relative overflow-hidden bg-[linear-gradient(135deg,var(--color-primary),var(--color-purple-400))] text-white"
                }
            >
                {plan !== "community" && (
                    <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
                )}
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <span
                            className={`inline-flex items-center rounded-md px-2.5 py-1 text-caption-2 font-semibold ${
                                plan === "community" ? "bg-grey-light text-grey dark:bg-dark-3" : "bg-white/20 text-white"
                            }`}
                        >
                            Current plan
                        </span>
                        <div className="mt-3 flex items-end gap-2">
                            <span
                                className={`font-poppins text-[2.25rem] leading-none font-extrabold ${
                                    plan === "community" ? "text-black dark:text-white" : ""
                                }`}
                            >
                                {PLAN_LABEL[plan]}
                            </span>
                            {info.expired && (
                                <span className="mb-1 rounded-md bg-error/15 px-2 py-0.5 text-caption-2 font-semibold text-error">
                                    expired
                                </span>
                            )}
                        </div>
                        <p className={`mt-2 text-caption-1 ${plan === "community" ? "text-grey" : "text-white/85"}`}>
                            {plan === "community"
                                ? "Free and open-source, self-hosted forever."
                                : info.customer
                                  ? `Licensed to ${info.customer}`
                                  : "Licensed install"}
                            {info.expiresAt && !info.expired
                                ? ` · renews ${new Date(info.expiresAt).toLocaleDateString()}`
                                : ""}
                        </p>
                    </div>
                    <Link
                        href="/settings/plan"
                        className={
                            plan === "community"
                                ? "btn-secondary h-11 px-5"
                                : "inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-5 font-bold text-primary transition-transform active:scale-[0.98]"
                        }
                    >
                        <Icon
                            className={`h-5 w-5 ${plan === "community" ? "fill-primary dark:fill-lilac" : "fill-primary"}`}
                            name="key"
                        />
                        Manage license
                    </Link>
                </div>
            </Card>

            {/* Compare editions */}
            <div>
                <h2 className="mb-1 text-h5 text-black dark:text-white">Compare editions</h2>
                <p className="mb-4 text-caption-2 text-grey">
                    Every edition is the same self-hosted install. A license key unlocks the paid tiers.
                </p>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {PLANS.map((p) => {
                        const isCurrent = p.id === plan;
                        const rank = PLAN_RANK[p.id];
                        return (
                            <Card
                                key={p.id}
                                className={`flex flex-col ${isCurrent ? "!border-2 !border-primary" : "border border-grey-light dark:border-grey-light/10"}`}
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-h5 text-black dark:text-white">{p.name}</h3>
                                    {isCurrent && (
                                        <span className="rounded-md bg-primary/15 px-2 py-0.5 text-caption-2 font-semibold text-primary dark:text-lilac">
                                            Current
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className="font-poppins text-h4 font-extrabold text-black dark:text-white">{p.id === "pro" && livePrice.pro ? livePrice.pro : p.id === "enterprise" && livePrice.enterprise ? livePrice.enterprise : p.price}</span>
                                    <span className="text-caption-2 text-grey">{(p.id === "pro" && livePrice.pro) || (p.id === "enterprise" && livePrice.enterprise) ? "/mo · " : ""}{p.cadence}</span>
                                </div>
                                <p className="mt-2 min-h-[2.5rem] text-caption-2 text-grey">{p.tagline}</p>
                                <ul className="mt-4 flex grow flex-col gap-2">
                                    {p.highlights.map((h) => {
                                        const isLeadIn = h.startsWith("Everything in");
                                        return (
                                            <li
                                                key={h}
                                                className={`flex items-start gap-2 text-caption-1 ${
                                                    isLeadIn ? "font-semibold text-black dark:text-white" : "text-grey"
                                                }`}
                                            >
                                                {!isLeadIn && (
                                                    <Icon className="mt-0.5 h-4 w-4 shrink-0 fill-success" name="check" />
                                                )}
                                                <span>{h}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                                <div className="mt-5">
                                    <PlanCta
                                        id={p.id}
                                        name={p.name}
                                        isCurrent={isCurrent}
                                        rank={rank}
                                        currentRank={currentRank}
                                        canManage={canManage}
                                        checkoutReady={checkoutReady}
                                        onUpgrade={() => setUpgradeOpen(true)}
                                    />
                                </div>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {upgradeOpen && feed && <UpgradeDialog feed={feed} onClose={() => setUpgradeOpen(false)} />}
        </div>
    );
};

const PlanCta = ({
    id,
    name,
    isCurrent,
    rank,
    currentRank,
    canManage,
    checkoutReady,
    onUpgrade,
}: {
    id: Plan;
    name: string;
    isCurrent: boolean;
    rank: number;
    currentRank: number;
    canManage: boolean;
    checkoutReady: boolean;
    onUpgrade: () => void;
}) => {
    if (isCurrent) {
        return (
            <span className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary/10 font-bold text-primary dark:text-lilac">
                <Icon className="h-5 w-5 fill-primary dark:fill-lilac" name="check" />
                Your plan
            </span>
        );
    }
    if (rank < currentRank) {
        return <span className="block py-3 text-center text-caption-2 text-grey">Included in your plan</span>;
    }
    // An upgrade.
    if (!canManage) {
        return (
            <span className="block py-3 text-center text-caption-2 text-grey">Ask an owner to upgrade to {PLAN_LABEL[id]}</span>
        );
    }
    // Enterprise is custom-priced — route to sales rather than self-serve.
    if (id === "enterprise") {
        return (
            <a
                href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("FlowCMS Enterprise enquiry")}`}
                className="btn-secondary h-11 w-full"
            >
                <Icon className="h-5 w-5 fill-primary dark:fill-lilac" name="sparkles" />
                Contact sales
            </a>
        );
    }
    // Pro: self-serve checkout when the vendor has it wired; otherwise fall back to pasting a key.
    if (id === "pro" && checkoutReady) {
        return (
            <button type="button" onClick={onUpgrade} className="btn-primary h-11 w-full">
                <Icon className="h-5 w-5 fill-white" name="sparkles" />
                Upgrade to {name}
            </button>
        );
    }
    return (
        <Link href="/settings/plan" className="btn-primary h-11 w-full">
            <Icon className="h-5 w-5 fill-white" name="sparkles" />
            Upgrade to {name}
        </Link>
    );
};

/* ── Upgrade to Pro: pick seats + billing interval, then start Stripe Checkout ───────── */
function UpgradeDialog({ feed, onClose }: { feed: PricingFeed; onClose: () => void }) {
    const included = feed.seat?.included ?? 3;
    const seat = useMemo(() => feed.seat ?? { included, monthly: 15, annual: 150 }, [feed, included]);
    const [annual, setAnnual] = useState(true);
    const [seats, setSeats] = useState(included);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const { total, perMo, savePct } = useMemo(() => {
        const extra = Math.max(0, seats - included);
        const base = annual ? feed.pro.annual : feed.pro.monthly;
        const seatPrice = annual ? seat.annual : seat.monthly;
        const total = base + extra * seatPrice;
        return { total, perMo: annual ? total / 12 : total, savePct: Math.round((1 - feed.pro.annual / (feed.pro.monthly * 12)) * 100) };
    }, [annual, seats, included, seat, feed]);

    const start = async () => {
        setBusy(true);
        setErr(null);
        try {
            const out = await api<{ url?: string; error?: string }>("/billing/checkout", {
                method: "POST",
                body: JSON.stringify({ interval: annual ? "year" : "month", seats }),
            });
            if (out.url) {
                window.location.href = out.url;
                return;
            }
            setErr(out.error ?? "Could not start checkout. Please try again.");
            setBusy(false);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not start checkout. Please try again.");
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
            <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/40" onClick={() => !busy && onClose()} />
            <Card className="relative z-10 w-full max-w-md">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-h5 text-black dark:text-white">Upgrade to Pro</h3>
                        <p className="mt-0.5 text-caption-1 text-grey">{included} seats included · {money(annual ? seat.annual : seat.monthly, feed.currency)}{annual ? "/yr" : "/mo"} per extra seat</p>
                    </div>
                    <button type="button" aria-label="Close" className="-mr-1 -mt-1 rounded-lg p-2 text-grey hover:text-black dark:hover:text-white" onClick={() => !busy && onClose()}>✕</button>
                </div>

                {/* Billing interval */}
                <div role="tablist" aria-label="Billing interval" className="mt-4 flex rounded-2xl border border-grey-light p-1 dark:border-grey-light/10">
                    {([["month", "Monthly"], ["year", "Annual"]] as const).map(([val, label]) => {
                        const active = (val === "year") === annual;
                        return (
                            <button
                                key={val}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setAnnual(val === "year")}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-caption-1 font-semibold transition-colors ${active ? "bg-primary text-white" : "text-grey hover:text-black dark:hover:text-white"}`}
                            >
                                {label}
                                {val === "year" && savePct > 0 && <span className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold ${active ? "bg-white/20 text-white" : "bg-success/15 text-success"}`}>Save {savePct}%</span>}
                            </button>
                        );
                    })}
                </div>

                {/* Seats */}
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-grey-light px-4 py-3.5 dark:border-grey-light/10">
                    <div className="min-w-0">
                        <div className="text-caption-1 font-semibold text-black dark:text-white">Seats</div>
                        <div className="truncate text-caption-2 text-grey">{included} included, add more any time</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button type="button" aria-label="Remove seat" onClick={() => setSeats((s) => Math.max(included, s - 1))} disabled={seats <= included} className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-lg font-bold text-primary disabled:opacity-40 dark:text-lilac">−</button>
                        <span className="w-7 text-center text-title font-bold tabular-nums text-black dark:text-white">{seats}</span>
                        <button type="button" aria-label="Add seat" onClick={() => setSeats((s) => Math.min(500, s + 1))} className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-lg font-bold text-primary dark:text-lilac">+</button>
                    </div>
                </div>

                {/* Summary */}
                <div className="mt-4 flex items-end justify-between border-t border-grey-light pt-4 dark:border-grey-light/10">
                    <div>
                        <div className="flex items-end gap-1.5">
                            <span className="font-poppins text-h4 font-extrabold text-black dark:text-white">{money(perMo, feed.currency, perMo % 1 ? 2 : 0)}</span>
                            <span className="pb-1 text-caption-2 text-grey">/mo</span>
                        </div>
                        <div className="mt-0.5 text-caption-2 text-grey">{annual ? `${money(total, feed.currency)} billed yearly` : `${money(total, feed.currency)} billed monthly`}</div>
                    </div>
                </div>

                {err && <div className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-caption-1 text-error">{err}</div>}

                <button type="button" onClick={start} disabled={busy} className="btn-primary mt-4 h-11 w-full">
                    {busy ? "Starting checkout…" : "Continue to checkout"}
                </button>
                <p className="mt-2 text-center text-caption-2 text-grey">Secure checkout by Stripe. Cancel anytime.</p>
            </Card>
        </div>
    );
}

export default Billing;
