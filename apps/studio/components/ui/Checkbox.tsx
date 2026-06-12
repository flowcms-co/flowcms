import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Controlled checkbox with a custom box (supports an indeterminate visual for
 * the table's "select all" header).
 */
const Checkbox = ({
    checked,
    indeterminate,
    onChange,
    "aria-label": ariaLabel,
}: {
    checked: boolean;
    indeterminate?: boolean;
    onChange: (checked: boolean) => void;
    "aria-label"?: string;
}) => {
    const active = checked || indeterminate;
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={indeterminate ? "mixed" : checked}
            aria-label={ariaLabel}
            onClick={() => onChange(!checked)}
            className={cn(
                "flex items-center justify-center w-5 h-5 rounded-[0.4rem] border transition-colors",
                active
                    ? "bg-primary border-primary"
                    : "bg-transparent border-grey-light hover:border-primary dark:border-grey-light/20",
            )}
        >
            {indeterminate ? (
                <span className="w-2.5 h-0.5 rounded-full bg-white" />
            ) : checked ? (
                <Icon className="w-3.5 h-3.5 fill-white" name="check" />
            ) : null}
        </button>
    );
};

export default Checkbox;
