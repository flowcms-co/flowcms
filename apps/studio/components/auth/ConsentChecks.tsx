"use client";

/**
 * The two consent checkboxes every account must tick before it can be created
 * (first-run claim, public signup) or keep going (the one-time prompt for
 * accounts that predate consent capture). Both are required and start
 * unchecked; the submit button they gate stays disabled until both are on.
 * Terms and privacy links open on flowcms.co in a new tab.
 */

export const TERMS_URL = "https://flowcms.co/legal/terms";
export const PRIVACY_URL = "https://flowcms.co/legal/privacy";

const linkCls = "font-semibold text-primary underline decoration-primary/30 underline-offset-2 transition-opacity hover:opacity-70 dark:text-lilac";

const boxCls =
    "mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer appearance-auto rounded accent-primary";

type Props = {
    terms: boolean;
    marketing: boolean;
    onTerms: (v: boolean) => void;
    onMarketing: (v: boolean) => void;
    /** Extra classes on the wrapper (e.g. the setup wizard's entrance stagger). */
    className?: string;
};

const ConsentChecks = ({ terms, marketing, onTerms, onMarketing, className }: Props) => (
    <div className={`flex flex-col gap-2.5 rounded-xl border border-grey-light bg-lavender-mist/30 p-4 dark:border-white/10 dark:bg-white/[0.03] ${className ?? ""}`}>
        <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={terms} onChange={(e) => onTerms(e.target.checked)} className={boxCls} />
            <span className="text-caption-1 leading-snug text-black dark:text-white">
                I agree to the{" "}
                <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    Terms of Service
                </a>{" "}
                and{" "}
                <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    Privacy Policy
                </a>
                , and to receive essential service and security emails.
            </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={marketing} onChange={(e) => onMarketing(e.target.checked)} className={boxCls} />
            <span className="text-caption-1 leading-snug text-black dark:text-white">
                Email me Flow CMS product updates, tips and occasional offers.
            </span>
        </label>
    </div>
);

export default ConsentChecks;
