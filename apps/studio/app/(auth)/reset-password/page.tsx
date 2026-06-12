"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

const inputCls =
    "w-full h-11 px-4 rounded-2xl border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

function ResetForm() {
    const router = useRouter();
    const token = useSearchParams().get("token") ?? "";
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        if (password !== confirm) {
            setError("Passwords don't match.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
            router.replace("/login?reset=1");
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not reset password.");
            setBusy(false);
        }
    }

    if (!token) {
        return (
            <div>
                <h2 className="font-poppins text-h3 font-extrabold text-black dark:text-white">Invalid link</h2>
                <p className="mt-2 text-body-sm text-grey">This reset link is missing or malformed. Request a new one.</p>
                <Link href="/forgot-password" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary font-bold text-white">Request new link</Link>
            </div>
        );
    }

    return (
        <div>
            <h2 className="font-poppins text-h3 font-extrabold text-black dark:text-white">Set a new password</h2>
            <p className="mt-1 text-body-sm text-grey">Choose a strong password (8+ characters).</p>

            <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
                {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>}
                <label className="flex flex-col gap-1.5">
                    <span className="text-caption-1 font-semibold text-black dark:text-white">New password</span>
                    <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="text-caption-1 font-semibold text-black dark:text-white">Confirm password</span>
                    <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="••••••••" />
                </label>
                <button type="submit" disabled={busy} className="btn-primary mt-2 w-full">
                    {busy ? "Saving…" : "Reset password"}
                </button>
            </form>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ResetForm />
        </Suspense>
    );
}
