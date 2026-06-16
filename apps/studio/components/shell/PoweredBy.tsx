"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type VersionInfo = { version?: string; deployment?: string };
type Health = { status?: string };

/**
 * "Powered by FlowCMS" footer badge (Enterprise white-label). A premium card: the
 * FlowCMS wordmark, the running version + deployment kind, and a live API health
 * dot. Links to flowcms.co. Collapses to just the mark on a narrow sidebar.
 */
const PoweredBy = ({ collapsed = false }: { collapsed?: boolean }) => {
    const [info, setInfo] = useState<VersionInfo | null>(null);
    const [healthy, setHealthy] = useState<boolean | null>(null);

    useEffect(() => {
        let off = false;
        api<VersionInfo>("/system/version")
            .then((v) => !off && setInfo(v))
            .catch(() => undefined);
        api<Health>("/health")
            .then((h) => !off && setHealthy(h.status === "ok"))
            .catch(() => !off && setHealthy(false));
        return () => {
            off = true;
        };
    }, []);

    const deployment = info?.deployment === "aio" ? "Managed" : "Self-hosted";

    if (collapsed) {
        return (
            <a
                href="https://flowcms.co"
                target="_blank"
                rel="noopener noreferrer"
                title="Powered by FlowCMS"
                className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform hover:scale-105"
            >
                <Image src="/brand/icon.svg" alt="FlowCMS" width={28} height={28} unoptimized className="h-7 w-7 rounded-[0.55rem]" />
            </a>
        );
    }

    return (
        <a
            href="https://flowcms.co"
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-2xl border border-grey-light/70 bg-surface px-3 py-3 shadow-[0_1px_2px_rgba(26,26,46,0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_0.5rem_1.25rem_rgba(108,92,231,0.16)] dark:border-grey-light/15 dark:bg-dark-1"
        >
            <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-grey">Powered by</span>
            {/* The real wordmark lockup (icon + flowcms), swapped per theme so the
                text stays legible on the light card vs. the dark card. */}
            <span className="mt-1.5 block">
                <Image src="/brand/primary-light.svg" alt="FlowCMS" width={140} height={36} unoptimized className="block h-auto w-[8.75rem] dark:hidden" />
                <Image src="/brand/primary-dark.svg" alt="FlowCMS" width={140} height={36} unoptimized className="hidden h-auto w-[8.75rem] dark:block" />
            </span>
            <span className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption-2 text-grey">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", healthy === false ? "bg-error" : "bg-success")} />
                <span className="font-medium text-black/70 dark:text-white/70">{deployment}</span>
                {info?.version && (
                    <>
                        <span className="text-grey/50">·</span>
                        <span className="font-mono text-grey">v{info.version}</span>
                    </>
                )}
            </span>
            <span className={cn("mt-1 block text-caption-2 font-semibold", healthy === false ? "text-error" : "text-success")}>
                API: {healthy === null ? "Checking…" : healthy ? "Healthy" : "Unreachable"}
            </span>
        </a>
    );
};

export default PoweredBy;
