"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import ContentTable from "@/templates/ContentPage/ContentTable";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type RefType = { id: string; name: string; routePattern?: string | null };

type ApiType = { id: string; name: string; pageType?: string; routePattern?: string | null };

/**
 * The "Reference" content view: a sub-tab per Reference-Page content type (Tags,
 * Cities, …), each listing that type's entries via a type-scoped ContentTable. Only
 * reachable once a Reference-Page type exists; shows guidance otherwise.
 */
const ReferenceContent = () => {
    const [types, setTypes] = useState<RefType[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        api<ApiType[]>("/content-types")
            .then((all) => {
                if (cancelled) return;
                const refs = all
                    .filter((t) => t.pageType === "reference")
                    .map((t) => ({ id: t.id, name: t.name, routePattern: t.routePattern }));
                setTypes(refs);
                setActiveId((cur) => cur ?? refs[0]?.id ?? null);
            })
            .catch(() => {
                /* content.read required */
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) return null;

    if (!types.length) {
        return (
            <Card className="!p-10 text-center">
                <p className="mx-auto max-w-lg text-body text-grey">
                    No reference pages yet. In the{" "}
                    <Link href="/settings/content?tab=content-model" className="font-medium text-primary hover:underline dark:text-lilac">
                        Schema Builder
                    </Link>
                    , create a content type and set its page type to <strong className="font-semibold text-black dark:text-white">Reference Page</strong> (for
                    example Tags or Cities). It will then appear here with its own tab.
                </p>
            </Card>
        );
    }

    const active = types.find((t) => t.id === activeId) ?? types[0];

    return (
        <div className="flex flex-col gap-5">
            {/* Per-type sub-tabs */}
            <div className="flex flex-wrap gap-2">
                {types.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveId(t.id)}
                        className={cn(
                            "shrink-0 rounded-md px-4 py-2 text-menu transition-colors",
                            t.id === active.id
                                ? "bg-primary text-white shadow-glow"
                                : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3 dark:hover:text-white",
                        )}
                    >
                        {t.name}
                    </button>
                ))}
            </div>

            {active.routePattern && (
                <p className="text-caption-2 text-grey">
                    URL pattern: <code className="font-mono text-primary dark:text-lilac">{active.routePattern}</code>
                </p>
            )}

            {/* Remount per type so selection/paging resets on tab switch. */}
            <ContentTable key={active.id} lockedTypeId={active.id} />
        </div>
    );
};

export default ReferenceContent;
