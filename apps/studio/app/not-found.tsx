import Link from "next/link";

/** App-wide 404. Replaces Next's unstyled default for unknown routes. */
export default function NotFound() {
    return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
            <div className="font-poppins text-5xl font-extrabold text-[#6C5CE7]">404</div>
            <h1 className="font-poppins mt-4 text-xl font-bold">Page not found</h1>
            <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground,#6b7280)]">
                The page you are looking for does not exist or may have moved.
            </p>
            <Link href="/" className="btn-primary mt-6">
                Back to dashboard
            </Link>
        </div>
    );
}
