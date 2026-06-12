import Link from "next/link";

/**
 * "Back to …" affordance for hidden report pages (pages under a section that are
 * not listed in the section tab row, e.g. the SEO reports reached from Dashboard
 * cards). Sits above the page header so the report reads as a drill-down.
 */
const BackLink = ({
    href = "/seo",
    label = "Back to SEO Dashboard",
}: {
    href?: string;
    label?: string;
}) => (
    <Link
        href={href}
        className="mb-4 inline-flex items-center gap-1.5 text-menu font-medium text-primary transition-colors hover:underline"
    >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        {label}
    </Link>
);

export default BackLink;
