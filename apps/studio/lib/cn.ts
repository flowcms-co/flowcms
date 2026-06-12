import { twMerge } from "tailwind-merge";

/** Merge Tailwind class strings, with later classes winning conflicts. */
export function cn(...classes: Array<string | false | null | undefined>): string {
    return twMerge(classes.filter(Boolean).join(" "));
}
