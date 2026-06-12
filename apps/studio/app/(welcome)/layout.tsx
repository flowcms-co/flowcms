"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/shell/Logo";
import { useSetupStatus } from "@/lib/useSetupStatus";

/** Guest-facing canvas for the first-run claim. Mirrors the guided-setup look but
 *  needs no session (no admin exists yet). Once the instance is claimed, this
 *  route has nothing to do — send the visitor to sign in. */
export default function WelcomeLayout({ children }: { children: ReactNode }) {
    const status = useSetupStatus();
    const router = useRouter();

    useEffect(() => {
        if (status?.claimed) router.replace("/login");
    }, [status, router]);

    if (status?.claimed) {
        return <div className="grid min-h-[100dvh] place-items-center bg-[#FBFAFF] text-grey dark:bg-dark-2">Loading…</div>;
    }

    return (
        <div className="relative flex min-h-[100dvh] flex-col bg-[radial-gradient(125%_125%_at_50%_-10%,#F1ECFF_0%,#FBFAFF_55%)] text-black dark:bg-[radial-gradient(125%_125%_at_50%_-10%,#241d47_0%,#14131f_55%)] dark:text-white">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <span className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-[#A29BFE]/25 blur-[120px]" />
                <span className="absolute top-1/3 -right-28 h-96 w-96 rounded-full bg-[#6C5CE7]/15 blur-[130px]" />
                <span className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-[#E0529C]/12 blur-[120px]" />
                {/* faint dot-grid texture in opposite corners */}
                <span className="absolute bottom-12 left-6 hidden h-36 w-44 opacity-50 dark:opacity-20 lg:block [background:radial-gradient(circle,#A29BFE_1.1px,transparent_1.3px)_0_0/15px_15px]" />
                <span className="absolute right-6 top-24 hidden h-36 w-44 opacity-50 dark:opacity-20 lg:block [background:radial-gradient(circle,#A29BFE_1.1px,transparent_1.3px)_0_0/15px_15px]" />
            </div>

            <header className="relative flex h-[72px] shrink-0 items-center justify-between px-5 sm:px-8">
                <Logo />
                <span className="inline-flex items-center gap-1.5 text-caption-1 text-grey dark:text-white/55">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-80">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M9.6 9.4C9.6 8.1 10.7 7 12 7s2.4 1 2.4 2.3c0 1.5-1.5 1.9-1.5 3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        <circle cx="12" cy="16.2" r="1" fill="currentColor" />
                    </svg>
                    First-run setup
                </span>
            </header>
            <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-10 pt-2 sm:px-6">
                {children}
            </main>
        </div>
    );
}
