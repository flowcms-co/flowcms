"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { api, API_ORIGIN } from "@/lib/api";

const inputCls =
    "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

const SSO_ERROR: Record<string, string> = {
    sso_unavailable: "Single sign-on isn't available right now. Sign in with your email instead.",
    sso_state: "Your sign-in attempt expired. Please try again.",
    sso_failed: "We couldn't sign you in through your identity provider. Contact your workspace admin.",
    sso_2fa: "Your account has two-factor authentication enabled. Sign in with your email and password below.",
};

export default function LoginPage() {
    const { signin } = useAuth();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [needCode, setNeedCode] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [ssoAvailable, setSsoAvailable] = useState(false);

    useEffect(() => {
        // Surface a failed SSO round-trip (the callback redirects here with ?error=).
        const err = new URLSearchParams(window.location.search).get("error");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (err && SSO_ERROR[err]) setError(SSO_ERROR[err]);
        // Show the SSO button only when an IdP is configured + licensed.
        api<{ available: boolean }>("/auth/sso/available")
            .then((r) => setSsoAvailable(!!r.available))
            .catch(() => {});
    }, []);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await signin(email, password, needCode ? code : undefined);
            if (res.twoFactorRequired) {
                setNeedCode(true);
                setBusy(false);
                return;
            }
            router.replace("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not sign in.");
            setBusy(false);
        }
    }

    return (
        <div>
            <h2 className="font-poppins text-h3 font-extrabold text-black dark:text-white">Welcome back</h2>
            <p className="mt-1 text-body-sm text-grey">Sign in to your Flow CMS workspace.</p>

            <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
                {error && (
                    <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm font-medium text-error">
                        {error}
                    </div>
                )}
                <label className="flex flex-col gap-1.5">
                    <span className="text-caption-1 font-semibold text-black dark:text-white">Email</span>
                    <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputCls}
                        placeholder="you@company.com"
                    />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between">
                        <span className="text-caption-1 font-semibold text-black dark:text-white">Password</span>
                        <Link href="/forgot-password" className="text-caption-2 font-semibold text-primary hover:opacity-70">Forgot?</Link>
                    </span>
                    <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputCls}
                        placeholder="••••••••"
                    />
                </label>

                {needCode && (
                    <label className="flex flex-col gap-1.5">
                        <span className="text-caption-1 font-semibold text-black dark:text-white">Verification code</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            autoFocus
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className={inputCls}
                            placeholder="6-digit code or backup code"
                        />
                        <span className="text-caption-2 text-grey">Enter the code from your authenticator app, or a backup code.</span>
                    </label>
                )}

                <button
                    type="submit"
                    disabled={busy}
                    className="mt-2 inline-flex h-11 items-center justify-center rounded-2xl bg-primary font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                    {busy ? "Signing in…" : needCode ? "Verify & sign in" : "Sign in"}
                </button>
            </form>

            {ssoAvailable && (
                <>
                    <div className="my-6 flex items-center gap-3 text-caption-2 text-grey">
                        <span className="h-px grow bg-grey-light dark:bg-dark-3" />
                        or
                        <span className="h-px grow bg-grey-light dark:bg-dark-3" />
                    </div>
                    <a
                        href={`${API_ORIGIN}/api/auth/sso/start`}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-grey-light font-bold text-black transition-colors hover:border-primary hover:text-primary active:scale-[0.98] dark:border-dark-3 dark:text-white dark:hover:border-primary"
                    >
                        Sign in with SSO
                    </a>
                </>
            )}



            {process.env.NODE_ENV !== "production" && (
                <p className="mt-6 rounded-2xl bg-lavender-mist px-4 py-3 text-center text-caption-1 text-grey dark:bg-dark-2">
                    Demo login · <span className="font-semibold text-black dark:text-white">admin@flowcms.local</span> / changeme
                </p>
            )}
        </div>
    );
}
