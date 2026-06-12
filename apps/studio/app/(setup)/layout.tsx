"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import Logo from "@/components/shell/Logo";

/** Calm, light canvas for the guided setup — soft brand-tinted glow, no app chrome. */
export default function SetupLayout({ children }: { children: ReactNode }) {
    const { status } = useAuth();
    const router = useRouter();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (status === "guest") router.replace("/login");
    }, [status, router]);

    if (status !== "authenticated") {
        return <div className="grid min-h-[100dvh] place-items-center bg-[#FBFAFF] text-grey dark:bg-dark-2">Loading…</div>;
    }

    return (
        <div ref={ref} className="relative flex min-h-[100dvh] flex-col bg-[radial-gradient(125%_125%_at_50%_-10%,#F1ECFF_0%,#FBFAFF_55%)] text-black dark:bg-[radial-gradient(125%_125%_at_50%_-10%,#241d47_0%,#14131f_55%)] dark:text-white">
            {/* Soft ambient color, behind everything */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <span className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-[#A29BFE]/25 blur-[120px]" />
                <span className="absolute top-1/3 -right-28 h-96 w-96 rounded-full bg-[#6C5CE7]/15 blur-[130px]" />
                <span className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-[#E0529C]/12 blur-[120px]" />
            </div>

            <header className="relative flex h-[72px] shrink-0 items-center justify-between px-6">
                <Logo />
                <span className="inline-flex items-center gap-1.5 text-caption-1 text-grey">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-70">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M9.5 9.5C9.5 8.12 10.62 7 12 7s2.5 1.12 2.5 2.5c0 1.5-1.5 2-1.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="12" cy="17" r="0.9" fill="currentColor" />
                    </svg>
                    Guided setup
                </span>
            </header>
            <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-5 pt-2">
                {children}
            </main>
        </div>
    );
}
