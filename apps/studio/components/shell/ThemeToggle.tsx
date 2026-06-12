"use client";

import { useTheme } from "next-themes";
import Icon from "@/components/ui/Icon";

/**
 * Light/dark toggle: the icon beside the pill reflects the CURRENT mode (sun in
 * light, moon in dark), and the knob sits on the matching side. Driven by the
 * `.dark` class next-themes sets on <html> (dark: variants) — no mount guard.
 */
const ThemeToggle = () => {
    const { resolvedTheme, setTheme } = useTheme();

    return (
        <button
            type="button"
            aria-label="Toggle color theme"
            className="flex items-center gap-3 cursor-pointer"
            onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
        >
            {/* Active-mode icon: sun in light, moon in dark */}
            <Icon className="w-6 h-6 fill-secondary dark:hidden" name="sun" />
            <Icon
                className="hidden w-6 h-6 fill-lilac dark:inline-flex"
                name="moon"
            />
            {/* Track (curved-square, no pill): knob left (light) → right (dark) */}
            <span className="relative flex w-[5.25rem] h-8 rounded-[0.75rem] bg-grey-light/70 transition-colors dark:bg-ink">
                <span className="absolute top-1 left-1 w-6 h-6 rounded-full bg-secondary transition-transform dark:translate-x-[3.25rem] dark:bg-lilac" />
            </span>
        </button>
    );
};

export default ThemeToggle;
