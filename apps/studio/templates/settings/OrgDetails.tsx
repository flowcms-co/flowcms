"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { api } from "@/lib/api";

type Org = { legalName: string | null; addressLines: string[]; taxId: string | null; billingEmail: string | null };

/** Organization / billing details for this install: shown on invoices and shared with the
 *  vendor so account and billing emails reach the right person at the right company. */
export default function OrgDetails() {
    const [legalName, setLegalName] = useState("");
    const [address, setAddress] = useState("");
    const [taxId, setTaxId] = useState("");
    const [billingEmail, setBillingEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const load = useCallback(async () => {
        try {
            const o = await api<Org>("/org");
            setLegalName(o.legalName ?? "");
            setAddress((o.addressLines ?? []).join("\n"));
            setTaxId(o.taxId ?? "");
            setBillingEmail(o.billingEmail ?? "");
        } catch {
            /* ignore */
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    const save = async () => {
        setBusy(true);
        setMsg(null);
        try {
            await api("/org", {
                method: "PUT",
                body: JSON.stringify({ legalName, addressLines: address.split("\n").map((s) => s.trim()).filter(Boolean), taxId, billingEmail }),
            });
            setMsg({ ok: true, text: "Saved." });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <h2 className="text-h5 text-black dark:text-white">Organization &amp; billing details</h2>
            <p className="mt-1 text-caption-1 text-grey">Shown on your invoices, and shared with FlowCMS so account and billing emails reach the right person at your company.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className="mb-1.5 block text-caption-1 font-semibold text-black dark:text-white">Company / legal name</span>
                    <input className="flow-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Acme Inc" />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-caption-1 font-semibold text-black dark:text-white">Billing email</span>
                    <input className="flow-input" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="billing@acme.com" />
                </label>
                <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-caption-1 font-semibold text-black dark:text-white">Billing address</span>
                    <textarea className="flow-input min-h-20" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={"123 Main St, Suite 4\nSan Francisco, CA 94114\nUnited States"} rows={3} />
                    <span className="mt-1 block text-caption-2 text-grey">One line per row, up to 4.</span>
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-caption-1 font-semibold text-black dark:text-white">Tax / VAT ID <span className="font-normal text-grey">(optional)</span></span>
                    <input className="flow-input" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="EU VAT, EIN, GSTIN…" />
                </label>
            </div>

            {msg && <div className={`mt-4 rounded-lg px-3 py-2 text-caption-1 ${msg.ok ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>{msg.text}</div>}

            <div className="mt-5">
                <button type="button" className="btn-primary h-10 px-4" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
            </div>
        </Card>
    );
}
