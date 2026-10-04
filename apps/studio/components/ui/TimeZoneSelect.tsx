"use client";

import { useMemo, useState } from "react";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { timeZones } from "@flowcms/shared/time";

const ZONES = timeZones();

/** Zones matching what was typed: case-insensitive, spaces match underscores
 *  ("new york" finds America/New_York). */
export const matchZones = (query: string, zones: string[] = ZONES): string[] => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "_");
    return q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
};

/** Searchable IANA time zone picker. Only a zone from the list can be chosen, so a
 *  misspelt name can never be saved. */
const TimeZoneSelect = ({ value, onChange }: { value: string; onChange: (tz: string) => void }) => {
    const [query, setQuery] = useState("");
    // Keep a valid stored alias ("Asia/Kolkata") selectable even if the list uses another name.
    const zones = useMemo(() => (ZONES.includes(value) ? ZONES : [value, ...ZONES]), [value]);
    const shown = matchZones(query, zones).slice(0, 60);
    return (
        <Combobox value={value} onChange={(v) => v && onChange(v)} onClose={() => setQuery("")} immediate>
            <ComboboxInput aria-label="Time zone" className="flow-input" displayValue={(z: string) => z} onChange={(e) => setQuery(e.target.value)} placeholder="Search time zones" spellCheck={false} />
            <ComboboxOptions anchor="bottom start" className="z-50 max-h-64 w-[var(--input-width)] overflow-auto rounded-xl border border-grey-light bg-white p-1 shadow-lg empty:invisible dark:border-grey-light/10 dark:bg-dark-2">
                {shown.map((z) => (
                    <ComboboxOption key={z} value={z} className="cursor-pointer rounded-lg px-3 py-2 text-body-sm text-black data-[focus]:bg-lavender-mist dark:text-white dark:data-[focus]:bg-dark-3">
                        {z}
                    </ComboboxOption>
                ))}
                {shown.length === 0 && <div className="px-3 py-2 text-caption-2 text-grey">No time zone matches &ldquo;{query}&rdquo;.</div>}
            </ComboboxOptions>
        </Combobox>
    );
};

export default TimeZoneSelect;
