"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSetupStatus } from "@/lib/useSetupStatus";

/** App-wide first-run gate. While the instance is unclaimed (no admin yet), the
 *  only reachable route is /welcome — every other path redirects there so a fresh
 *  install can't show the login/signup screens before an admin exists. Claimed
 *  instances are unaffected (the status fetch resolves `claimed: true`, no redirect). */
export default function FirstRunGate({ children }: { children: ReactNode }) {
    const status = useSetupStatus();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (!status) return;
        if (!status.claimed && pathname !== "/welcome") router.replace("/welcome");
    }, [status, pathname, router]);

    // Hold the unclaimed-instance flash: don't render a non-welcome page until we
    // know the instance is claimed. (No delay for claimed installs once cached.)
    if (status && !status.claimed && pathname !== "/welcome") return null;

    return <>{children}</>;
}
