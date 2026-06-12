"use client";

import {
    Listbox,
    ListboxButton,
    ListboxOptions,
    ListboxOption,
} from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * Brand-styled select — a drop-in for a native <select> that matches the rest
 * of the studio's controls in light + dark. Built on Headless UI's Listbox.
 *
 *  • Two looks via `variant`:
 *      - "filter" (default): a compact pill (h-9) for toolbar / table filters.
 *        `active` paints it as an applied filter (purple fill, no glow).
 *      - "field": a full-width bordered control (h-11) that matches `flow-input`,
 *        for use inside forms.
 *  • Options portal + anchor, so the panel never clips inside a scrolling or
 *    `overflow-hidden` container; the panel matches the trigger width in `field`.
 *  • Fixed-height trigger so swapping the chosen option never shifts the layout.
 */
const Select = ({
    value,
    onChange,
    options,
    ariaLabel,
    active = false,
    align = "start",
    variant = "filter",
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    ariaLabel?: string;
    active?: boolean;
    align?: "start" | "end";
    variant?: "filter" | "field";
    className?: string;
}) => {
    const current = options.find((o) => o.value === value);
    const field = variant === "field";
    return (
        <Listbox value={value} onChange={onChange}>
            <ListboxButton
                aria-label={ariaLabel}
                className={cn(
                    "group inline-flex items-center justify-between gap-2 transition-colors",
                    field
                        ? "h-11 w-full rounded-lg border border-grey-light bg-white pl-3.5 pr-3 text-[0.8125rem] font-normal text-black hover:border-primary data-[open]:border-primary dark:border-grey-light/10 dark:bg-dark-1 dark:text-white"
                        : cn(
                              "h-9 rounded-md pl-3.5 pr-2.5 text-caption-1 font-semibold",
                              active
                                  ? "bg-primary text-white"
                                  : "bg-lavender-mist text-grey hover:text-primary dark:bg-dark-3 dark:text-grey dark:hover:text-white",
                          ),
                    className,
                )}
            >
                <span className="truncate">{current?.label ?? ""}</span>
                <Icon
                    className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-200 group-data-[open]:rotate-180",
                        !field && active ? "fill-white" : "fill-grey",
                    )}
                    name="arrow-down"
                />
            </ListboxButton>
            <ListboxOptions
                anchor={{ to: `bottom ${align}`, gap: 6 }}
                transition
                className={cn(
                    "z-50 min-w-[12rem] rounded-xl border border-grey-light bg-white p-1.5 shadow-[0_1rem_2.5rem_rgba(26,26,46,0.14)]",
                    field && "w-[var(--button-width)]",
                    "origin-top transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0",
                    "dark:border-grey-light/10 dark:bg-dark-1 dark:shadow-[0_1rem_2.5rem_rgba(0,0,0,0.5)]",
                )}
            >
                {options.map((o) => (
                    <ListboxOption
                        key={o.value}
                        value={o.value}
                        disabled={o.disabled}
                        className={cn(
                            "group flex h-9 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 text-caption-1 text-black transition-colors",
                            "data-[focus]:bg-lavender-mist data-[selected]:font-semibold data-[selected]:text-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
                            "dark:text-white dark:data-[focus]:bg-dark-3 dark:data-[selected]:text-lilac",
                        )}
                    >
                        <span className="truncate">{o.label}</span>
                        <Icon
                            className="h-4 w-4 shrink-0 fill-primary opacity-0 group-data-[selected]:opacity-100 dark:fill-lilac"
                            name="check"
                        />
                    </ListboxOption>
                ))}
            </ListboxOptions>
        </Listbox>
    );
};

export default Select;
