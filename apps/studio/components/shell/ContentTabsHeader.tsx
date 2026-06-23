"use client";

import { useEffect, useState, type ReactNode } from "react";
import PageHeader from "@/components/shell/PageHeader";
import { NAV, type NavTab } from "@/lib/navigation";
import { api } from "@/lib/api";

/** The static Content sub-tabs (All Content, Block Editor, …) from the nav config. */
const BASE_TABS: NavTab[] = NAV.find((n) => n.href === "/content")?.tabs ?? [];

/**
 * Content section header that appends a "Reference" tab after the static tabs when
 * the workspace has at least one Reference-Page content type. Used by every Content
 * sub-page so the tab row stays consistent as you move between them.
 */
const ContentTabsHeader = ({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) => {
    const [hasReference, setHasReference] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api<{ pageType?: string }[]>("/content-types")
            .then((types) => {
                if (!cancelled) setHasReference(types.some((t) => t.pageType === "reference"));
            })
            .catch(() => {
                /* content.read required */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const tabs: NavTab[] = hasReference ? [...BASE_TABS, { label: "Reference", href: "/content/reference" }] : BASE_TABS;

    return <PageHeader title={title} intro={intro} tabs={tabs} actions={actions} />;
};

export default ContentTabsHeader;
