import { cn } from "@/lib/cn";

/**
 * Small on/off toggle switch (capsule track + sliding knob). For boolean
 * settings like a component's "repeatable" flag.
 */
const Switch = ({
    checked,
    onChange,
    "aria-label": ariaLabel,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    "aria-label"?: string;
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={() => onChange(!checked)}
        className={cn(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill transition-colors",
            checked ? "bg-primary" : "bg-grey-light dark:bg-dark-3",
        )}
    >
        <span
            className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(26,26,46,0.3)] transition-transform",
                checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
            )}
        />
    </button>
);

export default Switch;
