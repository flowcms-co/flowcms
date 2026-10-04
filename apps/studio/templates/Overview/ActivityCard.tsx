"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";
import Checkbox from "@/components/ui/Checkbox";
import EmptyState from "@/components/ui/EmptyState";
import { useDashboard, type DashboardSummary } from "@/lib/useDashboard";

/** Who acted, as a filter bucket. Custom roles are "other"; the scheduler and API
 *  tokens (no person behind the action) are "system". */
type ActivityRole = "super" | "admin" | "seo" | "editor" | "other" | "system";
type ActivityAction = "created" | "edited" | "submitted" | "approved" | "scheduled" | "published" | "unpublished" | "archived";

const ROLE_FILTERS: { id: ActivityRole; label: string; on: boolean }[] = [
    { id: "super", label: "Super Admin", on: true },
    { id: "admin", label: "Admin", on: true },
    { id: "seo", label: "Search Strategist", on: true },
    { id: "editor", label: "Editor", on: true },
    { id: "other", label: "Other roles", on: true },
    { id: "system", label: "Automation", on: true },
];

const ROLE_COLOR: Record<ActivityRole, string> = { super: "#6C5CE7", admin: "#3B82F6", seo: "#00B894", editor: "#F5A623", other: "#8B5CF6", system: "#A29BFE" };

/** Action verb → badge color + icon. */
const actionMeta: Record<ActivityAction, { label: string; color: string; icon: string }> = {
    created: { label: "created", color: "#A29BFE", icon: "edit" },
    edited: { label: "edited", color: "#6C5CE7", icon: "edit" },
    submitted: { label: "submitted for approval", color: "#F5A623", icon: "clock" },
    approved: { label: "approved", color: "#00B894", icon: "check" },
    scheduled: { label: "scheduled", color: "#3B82F6", icon: "calendar" },
    published: { label: "published", color: "#00B894", icon: "check" },
    unpublished: { label: "unpublished", color: "#9999B0", icon: "clock" },
    archived: { label: "archived", color: "#9999B0", icon: "document" },
};

/** Card-local activity row shape (carries the actor's avatar identity). */
type ActivityRow = {
    id: string;
    entryId: string;
    person: string;
    role: ActivityRole;
    /** The actor's real role name ("Legal Reviewer"), shown on the tag. */
    roleName: string;
    action: ActivityAction;
    target: string;
    type: string;
    time: string;
    authorId?: string | null;
    avatarUrl?: string | null;
    avatarStyle?: string | null;
};

const ROLE_BUCKET: Record<string, ActivityRole> = { super_admin: "super", admin: "admin", search_strategist: "seo", editor: "editor", system: "system" };
/** How many rows the compact card shows, and how many "Show more" expands to. */
const COMPACT = 5;
const relTime = (iso: string) => {
    const diff = Date.now() - +new Date(iso);
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? "yesterday" : `${d}d ago`;
};

/** Recorded content events → card rows: the role bucket to filter on, the actor's
 *  real role name for the tag, and the action exactly as it happened. */
export function toActivityRows(activity: NonNullable<DashboardSummary["activity"]>): ActivityRow[] {
    return activity.map((a) => ({
        id: a.id,
        entryId: a.entryId,
        person: a.person,
        role: ROLE_BUCKET[a.role] ?? "other",
        roleName: a.roleName,
        action: (a.action in actionMeta ? a.action : "edited") as ActivityAction,
        target: a.target,
        type: a.type,
        time: relTime(a.at),
        authorId: a.authorId,
        avatarUrl: a.avatarUrl,
        avatarStyle: a.avatarStyle,
    }));
}

/** Filter by role FIRST, then cut to the visible count, so a filter never empties
 *  a list that still has matching rows further down. */
export const visibleRows = (rows: ActivityRow[], onRoles: ActivityRole[], limit: number) => rows.filter((e) => onRoles.includes(e.role)).slice(0, limit);

/**
 * "Recent activity": the workspace's content events (create, edit, submit,
 * approve, schedule, publish, unpublish, archive), each with the person who did
 * it. Left: filter by the role that acted. Rows: avatar + action badge, actor +
 * role tag, "{action} {content}", content type + time.
 */
const ActivityCard = () => {
    const reduce = useReducedMotion();
    const [filters, setFilters] = useState(ROLE_FILTERS);
    const [expanded, setExpanded] = useState(false);
    const { data: summary, loading, error } = useDashboard();

    const entries = toActivityRows(summary?.activity ?? []);
    const onRoles = filters.filter((f) => f.on).map((f) => f.id);
    const matching = visibleRows(entries, onRoles, entries.length);
    const rows = matching.slice(0, expanded ? matching.length : COMPACT);

    const allOn = filters.every((f) => f.on);
    const someOn = filters.some((f) => f.on);

    const toggle = (id: string) =>
        setFilters((prev) =>
            prev.map((f) => (f.id === id ? { ...f, on: !f.on } : f)),
        );

    // "All roles": if everything is on, clear all; otherwise turn all on.
    const toggleAll = () =>
        setFilters((prev) => prev.map((f) => ({ ...f, on: !allOn })));

    // Loaded but nothing recorded yet (events are recorded from v1.10 on).
    const noActivity = summary != null && entries.length === 0;
    // Workspace activity is only sent to roles that can publish.
    const noAccess = summary != null && summary.activity === null;

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
                    {loading ? (
                        <div className="flex flex-col gap-3 py-2" aria-hidden>
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-11 animate-pulse rounded-2xl bg-grey-light/50 dark:bg-dark-3" />
                            ))}
                        </div>
                    ) : summary == null ? (
                        <p className="py-12 text-center text-body-sm text-error" role="alert">
                            {error ? "Couldn’t load recent activity. Reload to try again." : "Recent activity is unavailable."}
                        </p>
                    ) : noAccess ? (
                        <EmptyState
                            variant="bare"
                            icon="document"
                            title="No access to workspace activity"
                            description="Your role doesn’t include workspace-wide activity."
                            className="py-12"
                        />
                    ) : noActivity ? (
                        <EmptyState
                            variant="bare"
                            icon="document"
                            title="No activity yet"
                            description="Edits, approvals and publishes show up here from now on, with the person who made them."
                            className="py-12"
                        />
                    ) : (
                    <div className="flex flex-col">
                        {rows.map((e, i) => {
                            const act = actionMeta[e.action];
                            const roleColor = ROLE_COLOR[e.role];
                            return (
                                <motion.div
                                    key={e.id}
                                    initial={reduce ? false : { opacity: 0, y: 8 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.3 }}
                                    transition={{ duration: 0.4, delay: i * 0.05 }}
                                    className="flex items-center gap-4 px-3 py-3.5 -mx-3 rounded-2xl transition-colors hover:bg-lavender-mist/70 dark:hover:bg-dark-3/60"
                                >
                                    {/* Actor avatar (uploaded photo or chosen character; initials fallback) + action badge */}
                                    <span className="relative shrink-0 w-11 h-11">
                                        <Avatar
                                            userId={e.authorId}
                                            src={e.avatarUrl}
                                            character={e.avatarStyle}
                                            name={e.person}
                                            size={44}
                                        />
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
                                                    backgroundColor: `${roleColor}1a`,
                                                    color: roleColor,
                                                }}
                                            >
                                                {e.roleName}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 text-body-sm text-grey truncate">
                                            <span style={{ color: act.color }}>
                                                {act.label}
                                            </span>{" "}
                                            <Link href={`/content/editor?id=${e.entryId}`} className="text-black hover:text-primary dark:text-white">
                                                {e.target}
                                            </Link>
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

                    {matching.length > COMPACT && (
                        <div className="mt-5 text-center">
                            <button type="button" onClick={() => setExpanded((v) => !v)} className="btn-secondary min-w-[11rem]">
                                {expanded ? "Show less" : `Show ${matching.length - COMPACT} more`}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
};

export default ActivityCard;
