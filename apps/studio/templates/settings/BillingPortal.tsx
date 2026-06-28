"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { api, ApiError, API_BASE } from "@/lib/api";

/**
 * Self-serve subscription + payment management (Stripe). The studio talks to its own API,
 * which proxies to the vendor billing portal with the signed license token — the Stripe
 * secret never touches the browser. Renders only when this install has a Stripe-billed
 * subscription; community / offline-licensed installs see nothing here (License handles keys).
 */
type Summary = {
    plan: string;
    status: string;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    amount: { value: number; currency: string; interval: string } | null;
    seats: number | null;
    paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
    invoices: { id: string; number: string | null; amount: number; currency: string; status: string | null; created: number; hostedUrl: string | null; pdf: string | null }[];
    customer: { name: string; email: string | null };
    publishableKey: string | null;
};

const money = (v: number, cur: string) => {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase(), maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);
    } catch {
        return `${cur.toUpperCase()} ${v}`;
    }
};
const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const STATUS_STYLE: Record<string, string> = {
    active: "bg-success/12 text-success",
    trialing: "bg-info/12 text-info",
    past_due: "bg-warning/15 text-warning",
    unpaid: "bg-warning/15 text-warning",
    paused: "bg-grey-light text-grey dark:bg-dark-3",
    canceled: "bg-error/12 text-error",
};

function StatusBadge({ status, cancelAtPeriodEnd }: { status: string; cancelAtPeriodEnd: boolean }) {
    const label = cancelAtPeriodEnd && status === "active" ? "Cancels at period end" : status.replace(/_/g, " ");
    const style = cancelAtPeriodEnd && status === "active" ? "bg-warning/15 text-warning" : STATUS_STYLE[status] ?? "bg-grey-light text-grey dark:bg-dark-3";
    return <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-caption-2 font-semibold capitalize ${style}`}>{label}</span>;
}

/* ── Update-card form (Stripe Payment Element on a SetupIntent) ───────────────── */
function CardForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async () => {
        if (!stripe || !elements) return;
        setBusy(true);
        setErr(null);
        const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required" });
        if (error) {
            setErr(error.message ?? "Could not save the card.");
            setBusy(false);
            return;
        }
        const pmId = typeof setupIntent?.payment_method === "string" ? setupIntent.payment_method : setupIntent?.payment_method?.id;
        try {
            await api("/billing/portal", { method: "POST", body: JSON.stringify({ action: "set-default-method", paymentMethodId: pmId }) });
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not set the card as default.");
            setBusy(false);
        }
    };

    return (
        <div className="mt-4 rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
            {err && <div className="mb-3 rounded-lg bg-error/10 px-3 py-2 text-caption-1 text-error">{err}</div>}
            <PaymentElement />
            <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="btn-ghost btn-md" onClick={onCancel} disabled={busy}>Cancel</button>
                <button type="button" className="btn-primary btn-md" onClick={submit} disabled={busy || !stripe}>{busy ? "Saving…" : "Save card"}</button>
            </div>
        </div>
    );
}

export default function BillingPortal() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [available, setAvailable] = useState<boolean | null>(null); // null = loading
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [editCard, setEditCard] = useState<{ clientSecret: string; stripe: Promise<Stripe | null> } | null>(null);

    const load = useCallback(async () => {
        try {
            const s = await api<Summary>("/billing/portal");
            setSummary(s);
            setAvailable(true);
        } catch (e) {
            // 400 (no license) / 401 (no Stripe subscription) → this install isn't Stripe-billed.
            if (e instanceof ApiError && (e.status === 400 || e.status === 401 || e.status === 404)) setAvailable(false);
            else setAvailable(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const act = async (action: string, extra: Record<string, unknown> = {}) => {
        setBusy(action);
        setMsg(null);
        try {
            await api("/billing/portal", { method: "POST", body: JSON.stringify({ action, ...extra }) });
            await load();
            setMsg({ ok: true, text: "Done." });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't work." });
        } finally {
            setBusy(null);
        }
    };

    const startUpdateCard = async () => {
        setBusy("setup-intent");
        setMsg(null);
        try {
            const { clientSecret, publishableKey } = await api<{ clientSecret: string; publishableKey: string }>("/billing/portal", { method: "POST", body: JSON.stringify({ action: "setup-intent" }) });
            if (!publishableKey) throw new Error("Stripe is not fully configured.");
            setEditCard({ clientSecret, stripe: loadStripe(publishableKey) });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not start card update." });
        } finally {
            setBusy(null);
        }
    };

    const cardDone = () => {
        setEditCard(null);
        setMsg({ ok: true, text: "Card updated." });
        void load();
    };

    const elementsOptions = useMemo(() => (editCard ? { clientSecret: editCard.clientSecret, appearance: { theme: "stripe" as const, variables: { colorPrimary: "#6c5ce7", borderRadius: "10px" } } } : undefined), [editCard]);

    if (available === null || !summary) return null; // loading, or not a Stripe-billed install

    const s = summary;
    const pastDue = s.status === "past_due" || s.status === "unpaid";

    return (
        <Card>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Subscription &amp; billing</h2>
                    <p className="mt-0.5 text-caption-1 text-grey">Manage your plan, payment method and invoices.</p>
                </div>
                <div className="self-start sm:self-center"><StatusBadge status={s.status} cancelAtPeriodEnd={s.cancelAtPeriodEnd} /></div>
            </div>

            {msg && <div className={`mt-4 rounded-lg px-3 py-2 text-caption-1 ${msg.ok ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>{msg.text}</div>}

            {pastDue && (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-caption-1 text-warning"><strong>Payment needed.</strong> Your last charge didn&rsquo;t go through. Update your card or retry to keep your plan active.</div>
                    <button type="button" className="btn-primary btn-md shrink-0" onClick={() => act("retry")} disabled={busy === "retry"}>{busy === "retry" ? "Retrying…" : "Retry payment"}</button>
                </div>
            )}

            {/* Plan + price */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                    <div className="text-caption-2 text-grey">Plan</div>
                    <div className="mt-1 font-poppins text-h5 font-bold capitalize text-black dark:text-white">{s.plan}</div>
                    {s.amount && <div className="text-caption-1 text-grey">{money(s.amount.value, s.amount.currency)}/{s.amount.interval}{s.seats ? ` · ${s.seats} seat${s.seats === 1 ? "" : "s"}` : ""}</div>}
                </div>
                <div className="rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                    <div className="text-caption-2 text-grey">{s.cancelAtPeriodEnd ? "Ends" : "Renews"}</div>
                    <div className="mt-1 font-poppins text-h5 font-bold text-black dark:text-white">{s.currentPeriodEnd ? date(s.currentPeriodEnd) : "—"}</div>
                </div>
                <div className="rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                    <div className="text-caption-2 text-grey">Payment method</div>
                    <div className="mt-1 flex items-center gap-2 text-title font-semibold capitalize text-black dark:text-white">
                        {s.paymentMethod ? <><Icon name="wallet" className="h-4 w-4 fill-primary" />{s.paymentMethod.brand} •••• {s.paymentMethod.last4}</> : <span className="text-grey">None on file</span>}
                    </div>
                    {s.paymentMethod && <div className="text-caption-2 text-grey">Expires {s.paymentMethod.expMonth}/{s.paymentMethod.expYear}</div>}
                </div>
            </div>

            {/* Card update */}
            {editCard && elementsOptions ? (
                <Elements stripe={editCard.stripe} options={elementsOptions}>
                    <CardForm onDone={cardDone} onCancel={() => setEditCard(null)} />
                </Elements>
            ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary btn-md" onClick={startUpdateCard} disabled={busy === "setup-intent"}>
                        <Icon name="wallet" className="h-4 w-4 fill-primary dark:fill-lilac" />{busy === "setup-intent" ? "Loading…" : s.paymentMethod ? "Update card" : "Add a card"}
                    </button>
                    {/* Plan change */}
                    {s.plan !== "enterprise" && <button type="button" className="btn-secondary btn-md" onClick={() => act("change-plan", { plan: "enterprise" })} disabled={busy === "change-plan"}><Icon name="sparkles" className="h-4 w-4 fill-primary dark:fill-lilac" />Upgrade to Enterprise</button>}
                    {s.plan === "enterprise" && <button type="button" className="btn-ghost btn-md" onClick={() => act("change-plan", { plan: "pro" })} disabled={busy === "change-plan"}>Switch to Pro</button>}
                    {/* Cancel / resume */}
                    {s.cancelAtPeriodEnd ? (
                        <button type="button" className="btn-secondary btn-md" onClick={() => act("resume")} disabled={busy === "resume"}>Resume subscription</button>
                    ) : (
                        <button type="button" className="btn-danger btn-md" onClick={() => { if (confirm("Cancel your subscription at the end of the current period?")) act("cancel"); }} disabled={busy === "cancel"}>Cancel subscription</button>
                    )}
                </div>
            )}

            {/* Invoices */}
            {s.invoices.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-title font-semibold text-black dark:text-white">Invoices</h3>
                    <div className="mt-3 overflow-hidden rounded-2xl border border-grey-light dark:border-grey-light/10">
                        {s.invoices.map((inv, i) => (
                            <div key={inv.id} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-grey-light dark:border-grey-light/10" : ""}`}>
                                <span className="text-caption-1 font-semibold text-black dark:text-white">{inv.number ?? inv.id.slice(0, 12)}</span>
                                <span className="text-caption-2 text-grey">{date(inv.created)}</span>
                                <span className="ml-auto text-caption-1 font-semibold text-black dark:text-white">{money(inv.amount, inv.currency)}</span>
                                <span className={`rounded px-2 py-0.5 text-caption-2 font-semibold capitalize ${inv.status === "paid" ? "bg-success/10 text-success" : inv.status === "open" ? "bg-warning/10 text-warning" : "bg-grey-light text-grey dark:bg-dark-3"}`}>{inv.status}</span>
                                <a href={`${API_BASE}/billing/portal/invoice/${inv.id}`} target="_blank" rel="noopener noreferrer" className="text-caption-1 font-semibold text-primary dark:text-lilac">PDF</a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    );
}
