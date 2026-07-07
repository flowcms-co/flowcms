"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/ui/Icon";
import { useAuth, type AuthUser } from "@/components/providers/AuthProvider";
import { useBrand } from "@/lib/useBrand";
import ConsentChecks from "@/components/auth/ConsentChecks";
import { getClientIp } from "@/lib/clientIp";

/**
 * One-time consent prompt for accounts that predate consent capture: any
 * signed-in user without a Terms acceptance on record gets this blocking
 * modal on their next visit and continues only after accepting the Terms
 * (which cover essential service emails) and the product-email opt-in —
 * the same two checkboxes new installs tick during setup.
 */
const ConsentGate = () => {
    const { user, status, refresh } = useAuth();
    const [terms, setTerms] = useState(false);
    const [marketing, setMarketing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const brand = useBrand();
    const productName = brand.name ?? "Flow CMS";

    if (status !== "authenticated" || !user || user.termsAcceptedAt) return null;

    const accept = async () => {
        setBusy(true);
        setError(null);
        try {
            const clientIp = await getClientIp();
            await api<{ user: AuthUser }>("/auth/consent", { method: "POST", body: JSON.stringify(clientIp ? { clientIp } : {}) });
            await refresh();
        } catch {
            setError("Could not save your acceptance. Please try again.");
            setBusy(false);
        }
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="Review and accept the terms" className="fixed inset-0 z-[95] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_1.5rem_3.5rem_rgba(26,26,46,0.28)] dark:bg-dark-1 sm:p-7">
                <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-primary/15">
                        <Icon name="document" className="h-6 w-6 fill-primary dark:fill-lilac" />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-title font-semibold text-black dark:text-white">One quick thing</h3>
                        <p className="mt-0.5 text-caption-1 leading-snug text-grey">
                            Please review and accept the {productName} terms to keep using your workspace. It only takes a second.
                        </p>
                    </div>
                </div>

                <ConsentChecks terms={terms} marketing={marketing} onTerms={setTerms} onMarketing={setMarketing} className="mt-5" />

                {error && <p className="mt-3 text-caption-1 font-medium text-error">{error}</p>}

                <button
                    type="button"
                    onClick={accept}
                    disabled={!terms || !marketing || busy}
                    className="btn-primary mt-5 w-full justify-center disabled:opacity-50"
                >
                    {busy ? "Saving…" : "Accept & continue"}
                    {!busy && <Icon name="arrow-right" className="h-4 w-4 fill-white" />}
                </button>
            </div>
        </div>
    );
};

export default ConsentGate;
