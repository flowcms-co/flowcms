"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { useMailStatus } from "@/lib/useMailStatus";

const DISMISS_KEY = "flow-email-banner-dismissed";
const SNOOZE_MS = 7 * 86_400_000;

/** Warns people who can fix it that resets and invites go nowhere until email is set up. */
export default function EmailSetupBanner() {
    const { can } = useAuth();
    // Only roles that can open the email settings (others would get a 403 on the status check).
    return can("integrations.manage") ? <Banner /> : null;
}

function Banner() {
    const { connected, loading } = useMailStatus();
    const [snoozed, setSnoozed] = useState(true);

    useEffect(() => {
        try {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only
            setSnoozed(Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < SNOOZE_MS);
        } catch {
            setSnoozed(false);
        }
    }, []);

    if (loading || connected || snoozed) return null;

    const dismiss = () => {
        setSnoozed(true);
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
            /* private mode */
        }
    };

    return (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-warning/10 px-4 py-3 text-body-sm text-black dark:text-white">
            <span className="min-w-0 grow">
                <span className="font-semibold">No email provider is set up.</span> Password resets and invites will not be delivered.
            </span>
            <Link href="/settings/integrations?tab=email" className="font-semibold text-primary hover:opacity-70">Set up email</Link>
            <button type="button" onClick={dismiss} className="text-caption-1 text-grey hover:opacity-70">Later</button>
        </div>
    );
}
