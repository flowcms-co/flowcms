"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Checkbox from "@/components/ui/Checkbox";
import EmptyState from "@/components/ui/EmptyState";
import {
    actionMeta,
    activityRoleFilters,
    roleMeta,
    type ActivityRole,
    type ActivityAction,
} from "@/mocks/dashboard";
import { useDashboardSummary } from "@/lib/useDashboard";

/** Card-local activity row shape (live data has no avatar; we show initials instead). */
type ActivityRow = {
    id: string;
    person: string;
    role: ActivityRole;
    action: ActivityAction;
    target: string;
    type: string;
    time: string;
};

const ROLE_BUCKET: Record<string, ActivityRole> = { super_admin: "super", admin: "admin", search_strategist: "seo", editor: "editor" };
const ACTIONS = new Set<ActivityAction>(["published", "edited", "submitted", "approved", "scheduled", "generated"]);
const relTime = (iso: string) => {
    const diff = Date.now() - +new Date(iso);
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? "yesterday" : `${d}d ago`;
};

/**
 * "Recent activity" — full-width audit log (Unity CommentsPage Activity layout).
 * Left: filter by the ROLE that performed each action (Super Admin / Admin /
 * SEO Manager / Editor / AI Agents). Rows: avatar + action-type badge, actor +
 * role tag, "{action} {content}", content type + time. Working now via state.
 */
const ActivityCard = () => {
    const reduce = useReducedMotion();
    const [filters, setFilters] = useState(activityRoleFilters);
    const summary = useDashboardSummary();

    // Map live audit-log activity into the card's row shape (role bucket, known
    // action). Real activity carries no avatar, so we render an initials badge.
    const entries: ActivityRow[] = (summary?.activity ?? []).map((a) => {
        const action = (ACTIONS.has(a.action as ActivityAction) ? a.action : "edited") as ActivityAction;
        return {
            id: a.id,
            person: a.person,
            role: ROLE_BUCKET[a.role] ?? "editor",
            action,
            target: a.target,
            type: a.type,
            time: relTime(a.at),
        };
    });

    const onRoles = filters.filter((f) => f.on).map((f) => f.id);
    // Compact card: show only the 5 most recent; "Load more" opens the full
    // notifications page.
    const rows = entries
        .filter((e) => onRoles.includes(e.role))
        .slice(0, 5);

    const allOn = filters.every((f) => f.on);
    const someOn = filters.some((f) => f.on);

    const toggle = (id: string) =>
        setFilters((prev) =>
            prev.map((f) => (f.id === id ? { ...f, on: !f.on } : f)),
        );

    // "All roles": if everything is on, clear all; otherwise turn all on.
    const toggleAll = () =>
        setFilters((prev) => prev.map((f) => ({ ...f, on: !allOn })));

    // Loaded (not null) but the workspace has no audit activity at all.
    const noActivity = summary != null && entries.length === 0;

    return (
        <Card>
            <h2 className="text-h5 text-black dark:text-white mb-6">
                Recent activity
            </h2>

            <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
                {/* Role filters — plain checkbox rows; wrap on mobile, column on desktop */}
                <div className="flex flex-row flex-wrap gap-x-5 gap-y-3 lg:shrink-0 lg:w-36 lg:flex-col lg:gap-4">
                    <div className="flex items-center gap-2.5 text-body-sm font-medium text-black dark:text-dark-text">
                        <Checkbox
                            checked={allOn}
                            indeterminate={!allOn && someOn}
                            onChange={toggleAll}
                            aria-label="All roles"
                        />
                        <button type="button" onClick={toggleAll} className="cursor-pointer">
                            All roles
                        </button>
                    </div>
                    {filters.map((f) => (
                        <div
                            key={f.id}
                            className="flex items-center gap-2.5 text-body-sm text-black dark:text-dark-text"
                        >
                            <Checkbox
                                checked={f.on}
                                onChange={() => toggle(f.id)}
                                aria-label={f.label}
                            />
                            <button
                                type="button"
                                onClick={() => toggle(f.id)}
                                className="cursor-pointer"
                            >
                                {f.label}
                            </button>
                        </div>
                    ))}
                </div>

                {/* Activity feed */}
                <div className="grow">
                    {summary == null ? (
                        <div className="py-12" aria-hidden />
                    ) : noActivity ? (
                        <EmptyState
                            variant="bare"
                            icon="document"
                            title="No activity yet"
                            description="Edits, approvals and publishes will show up here."
                            className="py-12"
                        />
                    ) : (
                    <div className="flex flex-col">
                        {rows.map((e, i) => {
                            const act = actionMeta[e.action];
                            const rm = roleMeta[e.role];
                            return (
                                <motion.div
                                    key={e.id}
                                    initial={reduce ? false : { opacity: 0, y: 8 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.3 }}
                                    transition={{ duration: 0.4, delay: i * 0.05 }}
                                    className="flex items-center gap-4 px-3 py-3.5 -mx-3 rounded-2xl transition-colors hover:bg-lavender-mist/70 dark:hover:bg-dark-3/60"
                                >
                                    {/* Initials badge + action badge (live activity has no photo) */}
                                    <span className="relative shrink-0 w-11 h-11">
                                        <span
                                            className="flex h-11 w-11 items-center justify-center rounded-full text-title font-semibold uppercase"
                                            style={{ backgroundColor: `${rm.color}1a`, color: rm.color }}
                                            aria-hidden
                                        >
                                            {e.person.trim().charAt(0) || "?"}
                                        </span>
                                        <span
                                            className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-5 h-5 rounded-full border-2 border-white dark:border-dark-1"
                                            style={{ backgroundColor: act.color }}
                                        >
                                            <Icon className="w-2.5 h-2.5 fill-white" name={act.icon} />
                                        </span>
                                    </span>

                                    {/* Text */}
                                    <div className="grow min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-title text-black dark:text-white">
                                                {e.person}
                                            </span>
                                            <span
                                                className="px-2 py-0.5 rounded-pill text-caption-2"
                                                style={{
                                                    backgroundColor: `${rm.color}1a`,
                                                    color: rm.color,
                                                }}
                                            >
                                                {rm.label}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 text-body-sm text-grey truncate">
                                            <span style={{ color: act.color }}>
                                                {act.label}
                                            </span>{" "}
                                            <span className="text-black dark:text-white">
                                                {e.target}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Type + time */}
                                    <div className="hidden shrink-0 text-right sm:block">
                                        <div className="text-caption-1 text-black dark:text-white">
                                            {e.type}
                                        </div>
                                        <div className="text-caption-2 text-text-mute">
                                            {e.time}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}

                        {rows.length === 0 && (
                            <div className="py-12 text-center text-body text-grey">
                                No activity for the selected roles.
                            </div>
                        )}
                    </div>
                    )}

                    <div className="mt-5 text-center">
                        <Link
                            href="/notifications"
                            className="btn-secondary min-w-[11rem]"
                        >
                            Load more
                        </Link>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default ActivityCard;
