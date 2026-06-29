"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import Logo from "@/components/shell/Logo";

const FEATURES = [
    "AI tools powered by your own provider keys",
    "Live Search Console & Analytics dashboards",
    "A headless content API your sites plug into",
];

/** Split-screen auth layout: brand panel + the form. Redirects if already in. */
export default function AuthLayout({ children }: { children: ReactNode }) {
    const { status } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (status === "authenticated") router.replace("/");
    }, [status, router]);

    return (
        <div className="grid min-h-[100dvh] lg:grid-cols-2">
            {/* Brand panel */}
            <div className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between bg-[linear-gradient(150deg,#6C5CE7_0%,#8674F0_55%,#A29BFE_120%)]">
                <div className="pointer-events-none absolute -top-16 -right-12 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                <div className="relative">
                    <Logo onDark />
                </div>
                <div className="relative">
                    <h1 className="font-poppins text-[2.5rem] leading-tight font-extrabold">
                        The AI-powered CMS that works the way your team does.
                    </h1>
                    <ul className="mt-8 flex flex-col gap-3 text-white/85">
                        {FEATURES.map((f) => (
                            <li key={f} className="flex items-center gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-[0.5rem] bg-white/20 text-sm">
                                    ✓
                                </span>
                                {f}
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="relative text-caption-1 text-white/60">© 2026 Flow CMS</p>
            </div>

            {/* Form panel — column scroll container with an auto-margin child so the
                form centers when it fits and stays fully reachable when it overflows
                a short mobile viewport (justify-center would clip the top). */}
            <div className="flex min-h-[100dvh] flex-col overflow-y-auto bg-lavender-mist/40 px-6 py-10 dark:bg-dark-1 lg:min-h-0">
                <div className="m-auto w-full max-w-sm">
                    <div className="mb-8 lg:hidden">
                        <Logo />
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
