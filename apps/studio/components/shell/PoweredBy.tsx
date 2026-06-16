"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type VersionInfo = { version?: string; deployment?: string };
type Health = { status?: string };

/**
 * "Powered by FlowCMS" footer badge (Enterprise white-label). A premium card: the
 * FlowCMS mark, the running version + deployment kind, and a live API health dot.
 * Links to flowcms.co. Collapses to just the mark on a narrow sidebar.
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
            className="group block rounded-2xl border border-grey-light/70 bg-surface px-3 py-2.5 shadow-[0_1px_2px_rgba(26,26,46,0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_0.5rem_1.25rem_rgba(108,92,231,0.16)] dark:border-grey-light/15 dark:bg-dark-1"
        >
            <div className="flex items-center gap-2.5">
                <Image src="/brand/icon.svg" alt="FlowCMS" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-[0.6rem]" />
                <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-[0.625rem] font-medium uppercase tracking-wide text-grey">Powered by</span>
                    <span className="text-body-sm font-bold text-black dark:text-white">FlowCMS</span>
                </span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-caption-2 text-grey">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", healthy === false ? "bg-error" : "bg-success")} />
                <span className="font-medium text-black/70 dark:text-white/70">{deployment}</span>
                {info?.version && (
                    <>
                        <span className="text-grey/50">·</span>
                        <span className="truncate font-mono text-grey">v{info.version}</span>
                    </>
                )}
            </div>
            <div className={cn("mt-1 text-caption-2 font-semibold", healthy === false ? "text-error" : "text-success")}>
                API: {healthy === null ? "Checking…" : healthy ? "Healthy" : "Unreachable"}
            </div>
        </a>
    );
};

export default PoweredBy;
