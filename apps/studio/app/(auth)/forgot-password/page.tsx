"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

const inputCls =
    "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
            setSent(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong.");
        } finally {
            setBusy(false);
        }
    }

    if (sent) {
        return (
            <div>
                <h2 className="font-poppins text-h3 font-extrabold text-black dark:text-white">Check your email</h2>
                <p className="mt-2 text-body-sm text-grey">
                    If an account exists for <span className="font-semibold text-black dark:text-white">{email}</span>, we&rsquo;ve sent a link to reset
                    your password. The link expires in 1 hour.
                </p>
                <Link href="/login" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary font-bold text-white transition-transform active:scale-[0.98]">
                    Back to sign in
                </Link>
            </div>
        );
    }

    return (
        <div>
            <h2 className="font-poppins text-h3 font-extrabold text-black dark:text-white">Forgot password?</h2>
            <p className="mt-1 text-body-sm text-grey">We&rsquo;ll email you a reset link.</p>

            <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
                {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>}
                <label className="flex flex-col gap-1.5">
                    <span className="text-caption-1 font-semibold text-black dark:text-white">Email</span>
                    <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@company.com" />
                </label>
                <button type="submit" disabled={busy} className="btn-primary mt-2 w-full">
                    {busy ? "Sending…" : "Send reset link"}
                </button>
            </form>

            <p className="mt-6 text-center text-body-sm text-grey">
                Remembered it?{" "}
                <Link href="/login" className="font-semibold text-primary hover:opacity-70">Sign in</Link>
            </p>
        </div>
    );
}
