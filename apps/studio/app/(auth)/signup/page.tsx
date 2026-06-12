"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/components/providers/AuthProvider";
import { AVATAR_POOL, characterSrc, resolveCharacter } from "@/lib/avatar";

const inputCls =
    "w-full h-11 px-4 rounded-lg border border-grey-light bg-white text-black placeholder:text-grey outline-none transition-colors focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white";

export default function SignupPage() {
    const { signup } = useAuth();
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Avatar — pick a character (defaults to a stable one seeded from your email).
    const [character, setCharacter] = useState<string>("");
    const selectedChar = resolveCharacter(character, email || name || "you");

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await signup(name, email, password, { avatarStyle: selectedChar });
            router.replace("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create your account.");
            setBusy(false);
        }
    }

    return (
        <div>
            <h2 className="font-poppins text-h3 font-extrabold text-black dark:text-white">Create your account</h2>
            <p className="mt-1 text-body-sm text-grey">Join your team's Flow CMS workspace.</p>

            <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
                {error && (
                    <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm font-medium text-error">
                        {error}
                    </div>
                )}
                <label className="flex flex-col gap-1.5">
                    <span className="text-caption-1 font-semibold text-black dark:text-white">Name</span>
                    <input
                        type="text"
                        required
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputCls}
                        placeholder="Your name"
                    />
                </label>
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
                    <span className="text-caption-1 font-semibold text-black dark:text-white">Password</span>
                    <input
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputCls}
                        placeholder="At least 8 characters"
                    />
                </label>

                {/* Avatar picker */}
                <div className="rounded-lg border border-grey-light p-4 dark:border-grey-light/10">
                    <div className="flex items-center gap-4">
                        <Image src={characterSrc(selectedChar)} alt="Your avatar" width={64} height={64} unoptimized className="h-16 w-16 shrink-0 rounded-full bg-lavender-mist object-cover" />
                        <div className="min-w-0">
                            <span className="text-caption-1 font-semibold text-black dark:text-white">Pick your avatar</span>
                            <p className="text-caption-2 text-grey">Choose a character: you can change it anytime.</p>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-8 gap-2 sm:grid-cols-10">
                        {AVATAR_POOL.map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setCharacter(key)}
                                aria-label={`Character ${key}`}
                                className={`relative aspect-square overflow-hidden rounded-md bg-lavender-mist transition-transform hover:scale-105 dark:bg-dark-3 ${selectedChar === key ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-dark-2" : ""}`}
                            >
                                <Image src={characterSrc(key)} alt="" width={48} height={48} unoptimized className="h-full w-full object-cover" />
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={busy}
                    className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-primary font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                    {busy ? "Creating account…" : "Create account"}
                </button>
            </form>

            <p className="mt-6 text-center text-body-sm text-grey">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-primary hover:opacity-70">
                    Sign in
                </Link>
            </p>
        </div>
    );
}
