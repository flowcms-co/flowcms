import Image from "next/image";
import Link from "next/link";

/**
 * Flow CMS logo lockup (icon + wordmark). Used in the sidebar and on the auth
 * pages so both always match in size/weight.
 * - In the dashboard the icon doubles as the sidebar collapse trigger
 *   (`onIconClick`); without it, the icon is non-interactive.
 * - `iconOnly` (collapsed nav) renders just the icon.
 * - `onDark` uses the white-on-purple icon + white wordmark, for purple
 *   backgrounds like the login page.
 */
const Logo = ({
    iconOnly = false,
    onDark = false,
    compact = false,
    onIconClick,
    onNavigate,
}: {
    iconOnly?: boolean;
    onDark?: boolean;
    /** Slightly smaller icon + wordmark, for the narrowed sidebar. */
    compact?: boolean;
    onIconClick?: () => void;
    onNavigate?: () => void;
}) => {
    const size = compact ? 30 : 36;
    const icon = (
        <Image
            src={onDark ? "/brand/icon-on-purple.svg" : "/brand/icon.svg"}
            alt="Flow CMS"
            width={size}
            height={size}
            priority
            unoptimized
        />
    );

    return (
        <span className={`inline-flex items-center ${compact ? "gap-2" : "gap-2.5"}`}>
            {onIconClick ? (
                <button
                    type="button"
                    onClick={onIconClick}
                    aria-label="Toggle sidebar"
                    className="shrink-0 rounded-xl transition-transform hover:scale-105 active:scale-95"
                >
                    {icon}
                </button>
            ) : (
                <span className="shrink-0">{icon}</span>
            )}
            {!iconOnly && (
                <Link
                    href="/"
                    onClick={onNavigate}
                    className={`font-poppins ${compact ? "text-[1.35rem]" : "text-[1.6rem]"} font-bold tracking-[-0.01em] leading-none`}
                >
                    <span className={onDark ? "text-white" : "text-ink dark:text-white"}>flow</span>
                    <span className="inline-block w-[0.08em]" />
                    <span className={onDark ? "text-white/70" : "text-primary"}>cms</span>
                </Link>
            )}
        </span>
    );
};

export default Logo;
