"use client";

import Icon from "@/components/ui/Icon";
import Select, { type SelectOption } from "@/components/ui/Select";
import { type PillStatus } from "@/components/ui/StatusPill";
import { CONTENT_STATUSES } from "@/mocks/content";
import { cn } from "@/lib/cn";

type ContentItemStatus = Exclude<PillStatus, "approved">;

export type SortKey = "title" | "seoScore" | "updated" | "views";
export type SortDir = "asc" | "desc";

export type Filters = {
    query: string;
    /** Content type id, or "all". */
    type: string;
    status: ContentItemStatus | "all";
};

const STATUS_META: Record<ContentItemStatus, { label: string; color: string }> = {
    live: { label: "Live", color: "#00b894" },
    scheduled: { label: "Scheduled", color: "#3b82f6" },
    review: { label: "Review", color: "#6c5ce7" },
    draft: { label: "Draft", color: "#6a6a85" },
};

const SORT_OPTIONS: SelectOption[] = [
    { value: "updated", label: "Updated" },
    { value: "title", label: "Title" },
    { value: "seoScore", label: "SEO score" },
    { value: "views", label: "Views" },
];

const FilterBar = ({
    filters,
    onChange,
    total,
    types,
    localeOptions,
    localeFilter,
    onLocaleChange,
    sort,
    onSortChange,
    hideTypeFilter = false,
}: {
    filters: Filters;
    onChange: (next: Filters) => void;
    total: number;
    types: { id: string; name: string }[];
    localeOptions: SelectOption[];
    localeFilter: string;
    onLocaleChange: (l: string) => void;
    sort: { key: SortKey; dir: SortDir };
    onSortChange: (key: SortKey) => void;
    /** Hide the content-type selector (used when the view is already scoped to one
     *  type, e.g. a Reference sub-tab). */
    hideTypeFilter?: boolean;
}) => {
    const typeOptions: SelectOption[] = [
        { value: "all", label: "All types" },
        ...types.map((t) => ({ value: t.id, label: t.name })),
    ];

    return (
        <div className="flex flex-col gap-5">
            {/* Row 1: search + type + language */}
            <div className="flex flex-wrap items-center gap-2.5">
                <label className="relative flex flex-1 min-w-48 items-center">
                    <Icon
                        className="absolute left-4 w-5 h-5 fill-grey pointer-events-none"
                        name="search"
                    />
                    <input
                        type="text"
                        value={filters.query}
                        onChange={(e) => onChange({ ...filters, query: e.target.value })}
                        placeholder="Search by title or slug..."
                        className="w-full h-10 pl-11 pr-4 rounded-[0.625rem] border border-grey-light bg-white text-body-sm text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:bg-dark-1 dark:border-grey-light/10 dark:text-white"
                    />
                </label>

                {!hideTypeFilter && (
                    <Select
                        value={filters.type}
                        onChange={(v) => onChange({ ...filters, type: v })}
                        options={typeOptions}
                        ariaLabel="Filter by type"
                        active={filters.type !== "all"}
                        className="!h-10"
                    />
                )}

                {localeOptions.length > 1 && (
                    <Select
                        value={localeFilter}
                        onChange={onLocaleChange}
                        options={localeOptions}
                        ariaLabel="Filter by language"
                        align="end"
                        active={localeFilter !== "all"}
                        className="!h-10"
                    />
                )}
            </div>

            {/* Row 2: status pills + count + sort */}
            <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                    label="Any status"
                    color="#6c5ce7"
                    showDot={false}
                    selected={filters.status === "all"}
                    onClick={() => onChange({ ...filters, status: "all" })}
                />
                {CONTENT_STATUSES.map((s) => (
                    <StatusPill
                        key={s}
                        label={STATUS_META[s].label}
                        color={STATUS_META[s].color}
                        selected={filters.status === s}
                        onClick={() => onChange({ ...filters, status: s })}
                    />
                ))}

                <div className="ml-auto flex items-center gap-3">
                    <span className="text-caption-1 text-grey whitespace-nowrap">
                        {total} {total === 1 ? "item" : "items"}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-caption-2 text-grey">Sort:</span>
                        <Select
                            value={sort.key}
                            onChange={(v) => onSortChange(v as SortKey)}
                            options={SORT_OPTIONS}
                            ariaLabel="Sort by"
                            active={false}
                            className="!h-9"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatusPill = ({
    label,
    color,
    selected,
    onClick,
    showDot = true,
}: {
    label: string;
    color: string;
    selected: boolean;
    onClick: () => void;
    showDot?: boolean;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md text-caption-1 font-semibold transition-all",
            showDot ? "pl-3 pr-3.5" : "px-3.5",
            selected
                ? "bg-primary text-white shadow-glow"
                : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3 dark:text-grey dark:hover:text-white",
        )}
    >
        {showDot && (
            <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: selected ? "#fff" : color }}
            />
        )}
        {label}
    </button>
);

export default FilterBar;
