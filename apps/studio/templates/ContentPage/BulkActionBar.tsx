"use client";

import { Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type BulkAction = "publish" | "unpublish" | "draft" | "delete";

/**
 * Floating bulk-action bar. Slides up from the bottom when ≥1 row is selected.
 * High-contrast dark surface so it stands clearly off the page (light or dark)
 * with a strong shadow + ring, a purple count badge, and clearly-defined action
 * buttons. Each action runs as a background job (the app stays usable).
 */
const BulkActionBar = ({
    count,
    onClear,
    onAction,
    busy,
}: {
    count: number;
    onClear: () => void;
    onAction: (action: BulkAction) => void;
    busy?: boolean;
}) => (
    <Transition
        show={count > 0}
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 translate-y-4"
        enterTo="opacity-100 translate-y-0"
        leave="transition duration-150 ease-in"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-4"
    >
        <div className="fixed bottom-6 left-1/2 z-4 w-[calc(100%-2rem)] max-w-fit -translate-x-1/2 lg:left-[calc(50%+8rem)]">
            <div className="flex items-center gap-1.5 rounded-2xl bg-ink px-3 py-2.5 shadow-[0_1.5rem_3rem_rgba(26,26,46,0.45)] ring-1 ring-white/10 dark:bg-dark-3">
                <span className="inline-flex items-center gap-2 pl-1 pr-1.5 text-caption-1 font-semibold text-white">
                    <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-pill bg-primary text-[0.6875rem] font-bold text-white">
                        {count}
                    </span>
                    <span className="hidden sm:inline">selected</span>
                </span>

                <span className="h-7 w-px bg-white/15" />

                <BulkButton icon="check" label="Publish" onClick={() => onAction("publish")} disabled={busy} />
                <BulkButton icon="document" label="Move to draft" onClick={() => onAction("draft")} disabled={busy} />
                <BulkButton icon="trash" label="Delete" danger onClick={() => onAction("delete")} disabled={busy} />

                <span className="h-7 w-px bg-white/15" />

                <button
                    type="button"
                    onClick={onClear}
                    aria-label="Clear selection"
                    className="flex items-center justify-center w-9 h-9 rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <Icon className="w-5 h-5 fill-current" name="close" />
                </button>
            </div>
        </div>
    </Transition>
);

const BulkButton = ({
    icon,
    label,
    danger,
    onClick,
    disabled,
}: {
    icon: string;
    label: string;
    danger?: boolean;
    onClick?: () => void;
    disabled?: boolean;
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-caption-1 font-semibold whitespace-nowrap transition-colors disabled:opacity-50",
            danger
                ? "text-[#FF8B8A] hover:bg-error/25 hover:text-white"
                : "text-white/90 hover:bg-white/10 hover:text-white",
        )}
    >
        <Icon className="w-4 h-4 fill-current" name={icon} />
        <span className="hidden sm:inline">{label}</span>
    </button>
);

export default BulkActionBar;
