"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Menu, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { usePlan } from "@/components/providers/LicenseProvider";
import { useWorkspace } from "@/lib/useWorkspace";
import { useBrand } from "@/lib/useBrand";
import { useWorkspaces, switchWorkspace, type WorkspaceSummary } from "@/lib/useWorkspaces";
import CreateWorkspaceModal from "@/components/shell/CreateWorkspaceModal";
import { cn } from "@/lib/cn";

const initials = (s: string) =>
    s
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "W";

/** Square brand monogram for a workspace. */
const Mono = ({ name, size = "md" }: { name: string; size?: "sm" | "md" }) => (
    <span
        className={cn(
            "flex shrink-0 items-center justify-center rounded-[0.55rem] bg-primary font-bold text-white",
            size === "md" ? "h-7 w-7 text-[0.66rem]" : "h-7 w-7 text-[0.66rem]",
        )}
    >
        {initials(name)}
    </span>
);

/**
 * Workspace switcher (top of the sidebar). The brand monogram/logo doubles as the
 * sidebar collapse toggle (so there's no separate hamburger); the name + chevron
 * open the menu to jump between workspaces. "New workspace" creates one when the
 * install is licensed for `multi_workspace` (Enterprise). Rendered outside the
 * scrolling nav so the menu never clips.
 */
const WorkspaceSwitcher = ({ collapsed = false, onToggleCollapse }: { collapsed?: boolean; onToggleCollapse?: () => void }) => {
    const { has } = usePlan();
    const ws = useWorkspace();
    const brand = useBrand();
    const { workspaces, active } = useWorkspaces();
    const [createOpen, setCreateOpen] = useState(false);

    const canCreate = has("multi_workspace");
    const name = active?.name ?? ws?.name ?? "Workspace";
    const displayName = brand.name ?? name;

    const brandIcon = brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-[0.55rem] object-cover" />
    ) : (
        <Mono name={displayName} />
    );

    // Collapsed: the brand icon is the only control, and it expands the sidebar.
    if (collapsed) {
        return (
            <button
                type="button"
                onClick={onToggleCollapse}
                title={`${name} — expand sidebar`}
                aria-label="Expand sidebar"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-grey-light/70 bg-surface transition-colors hover:border-primary/40 active:scale-[0.98] dark:border-grey-light/15 dark:bg-dark-1"
            >
                {brandIcon}
            </button>
        );
    }

    const itemBase =
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3";

    return (
        <Menu as="div" className="relative w-full">
            <div className="flex h-11 w-full items-center gap-1.5 rounded-2xl border border-grey-light/70 bg-surface pl-1.5 pr-1.5 transition-colors hover:border-primary/40 dark:border-grey-light/15 dark:bg-dark-1">
                {/* Brand icon doubles as the collapse toggle (replaces the hamburger). */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleCollapse?.();
                    }}
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                    className="shrink-0 rounded-[0.55rem] transition-transform hover:scale-105 active:scale-95"
                >
                    {brandIcon}
                </button>
                {/* Name + chevron open the workspace menu. */}
                <Menu.Button className="group flex min-w-0 flex-1 items-center gap-1 py-1">
                    <span className="flex min-w-0 flex-col text-left leading-tight">
                        <span className="truncate text-[0.78rem] font-semibold leading-snug text-black dark:text-white">{displayName}</span>
                        <span className="truncate text-[0.68rem] text-grey">Workspace</span>
                    </span>
                    <Icon className="ml-auto h-3.5 w-3.5 shrink-0 fill-grey transition-colors group-hover:fill-primary" name="arrow-down" />
                </Menu.Button>
            </div>

            <Transition
                as={Fragment}
                enter="transition duration-100 ease-out"
                enterFrom="opacity-0 scale-95 -translate-y-1"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="transition duration-75 ease-in"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
            >
                <Menu.Items className="absolute top-full left-0 z-20 mt-2 w-64 rounded-2xl bg-surface p-2 shadow-[0_1.25rem_2.5rem_rgba(26,26,46,0.16)] focus:outline-none dark:bg-dark-1 dark:shadow-[0_1.25rem_2.5rem_rgba(0,0,0,0.5)]">
                    <div className="px-2.5 py-1.5 text-caption-2 text-grey">{workspaces.length > 1 ? "Switch workspace" : "Workspace"}</div>

                    {(workspaces.length ? workspaces : ([] as WorkspaceSummary[])).map((w) => (
                        <Menu.Item key={w.id}>
                            {() => (
                                <button type="button" onClick={() => !w.active && switchWorkspace(w.id)} className={cn(itemBase, w.active && "bg-lavender-mist dark:bg-dark-3")}>
                                    <Mono name={w.name} size="sm" />
                                    <span className="flex min-w-0 flex-col leading-tight">
                                        <span className="truncate text-title text-black dark:text-white">{w.name}</span>
                                        <span className="truncate text-caption-2 text-grey">{w.role.name}</span>
                                    </span>
                                    {w.active && <Icon className="ml-auto h-4 w-4 shrink-0 fill-primary" name="check" />}
                                </button>
                            )}
                        </Menu.Item>
                    ))}

                    <div className="my-1.5 h-px bg-grey-light/60 dark:bg-grey-light/10" />

                    {canCreate ? (
                        <Menu.Item>
                            {() => (
                                <button type="button" onClick={() => setCreateOpen(true)} className={cn(itemBase, "text-primary")}>
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.6rem] bg-primary/10">
                                        <Icon className="h-4 w-4 fill-primary" name="plus" />
                                    </span>
                                    <span className="text-title font-semibold text-primary">New workspace</span>
                                </button>
                            )}
                        </Menu.Item>
                    ) : (
                        <Menu.Item>
                            {() => (
                                <Link href="/settings/plan" className={itemBase}>
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.6rem] bg-lavender-mist dark:bg-dark-3">
                                        <Icon className="h-4 w-4 fill-grey" name="plus" />
                                    </span>
                                    <span className="text-title text-grey">New workspace</span>
                                    <span className="ml-auto rounded-md bg-black px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white dark:bg-white dark:text-black">Enterprise</span>
                                </Link>
                            )}
                        </Menu.Item>
                    )}
                </Menu.Items>
            </Transition>

            {canCreate && <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />}
        </Menu>
    );
};

export default WorkspaceSwitcher;
