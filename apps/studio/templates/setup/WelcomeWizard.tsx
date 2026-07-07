"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSetupStatus, setSetupStatus } from "@/lib/useSetupStatus";
import { IdentityScene } from "@/templates/setup/illustrations";
import { cn } from "@/lib/cn";
import ConsentChecks from "@/components/auth/ConsentChecks";
import { getClientIp } from "@/lib/clientIp";
import type { AuthUser } from "@/components/providers/AuthProvider";

gsap.registerPlugin(useGSAP, SplitText);

const MIN_PASSWORD = 12;

/* ── thin-line icons (follow currentColor), matching the flowcms icon feel ── */
const sp = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;
const GlobeIcon = () => (<svg {...sp}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" strokeWidth="1.6" /></svg>);
const BriefcaseIcon = () => (<svg {...sp}><rect x="3" y="7.5" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" /><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 12.5h18" stroke="currentColor" strokeWidth="1.6" /></svg>);
const UserIcon = () => (<svg {...sp}><circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
const MailIcon = () => (<svg {...sp}><rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.6" /><path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
const LockIcon = () => (<svg {...sp}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" /></svg>);
const EyeIcon = () => (<svg {...sp}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" /></svg>);
const EyeOffIcon = () => (<svg {...sp}><path d="M4 4l16 16M9.9 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.6M6.3 7.9A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.9-.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M9.8 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.6" /></svg>);
const ShieldIcon = ({ s = 18 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3l7 2.5V11c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V5.5L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M9 12l2 2 4-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const BoltIcon = () => (<svg {...sp}><path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>);
const CodeIcon = () => (<svg {...sp}><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>);

const FEATURES = [
    { icon: <ShieldIcon />, title: "Secure & private", desc: "Your data is yours. We never share or sell your content." },
    { icon: <BoltIcon />, title: "Built for performance", desc: "Optimized from the ground up to be fast and reliable." },
    { icon: <CodeIcon />, title: "Developer friendly", desc: "Powerful API and flexible content modeling." },
];

const inputBase =
    "w-full h-[50px] rounded-xl border bg-white pl-11 pr-4 text-body-sm text-black placeholder:text-grey outline-none transition-colors focus:border-primary border-grey-light dark:bg-white/[0.03] dark:text-white dark:placeholder:text-white/35 dark:border-white/10 dark:focus:border-lilac";
const iconWrap = "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey dark:text-white/40";

function Field({ label, icon, trailing, children }: { label: string; icon: ReactNode; trailing?: ReactNode; children: ReactNode }) {
    return (
        <label className="step-stagger block">
            <span className="mb-1.5 block text-caption-1 font-semibold text-black dark:text-white">{label}</span>
            <div className="relative">
                <span className={iconWrap}>{icon}</span>
                {children}
                {trailing}
            </div>
        </label>
    );
}

/** First-run claim: the first visitor creates the super admin here, then continues
 *  into the existing guided content setup. The CMS hostname is fixed at install / by
 *  the platform, so it is shown read-only for confirmation. */
export default function WelcomeWizard() {
    const scope = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const { refresh } = useAuth();
    const status = useSetupStatus();

    const [workspaceName, setWorkspaceName] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [acceptMarketing, setAcceptMarketing] = useState(false);

    useGSAP(
        () => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduce || document.hidden) return;
            const q = gsap.utils.selector(scope);
            const tl = gsap.timeline();
            const heading = scope.current?.querySelector(".step-heading") as HTMLElement | null;
            if (heading) {
                const split = SplitText.create(heading, { type: "lines, words", mask: "lines" });
                tl.from(split.words, { yPercent: 100, duration: 0.9, stagger: 0.08, ease: "expo.out" }, 0);
            }
            const pop = q(".step-pop");
            if (pop.length) tl.from(pop, { scale: 0.75, autoAlpha: 0, rotation: -6, transformOrigin: "50% 60%", duration: 0.65, ease: "back.out(1.6)" }, 0);
            const sub = q(".step-sub");
            if (sub.length) tl.from(sub, { autoAlpha: 0, y: 8, duration: 0.5, ease: "power2.out", clearProps: "transform,opacity" }, 0.25);
            const stag = q(".step-stagger");
            if (stag.length) tl.from(stag, { autoAlpha: 0, y: 10, duration: 0.45, stagger: 0.06, ease: "power2.out", clearProps: "transform,opacity,visibility" }, 0.3);
            const fade = q(".step-fade");
            if (fade.length) tl.from(fade, { autoAlpha: 0, y: 8, duration: 0.5, ease: "power2.out", clearProps: "transform,opacity" }, 0.45);
        },
        { scope },
    );

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        if (!workspaceName.trim()) {
            setError("Workspace name is required.");
            return;
        }
        if (!name.trim()) {
            setError("Your name is required.");
            return;
        }
        if (password.length < MIN_PASSWORD) {
            setError(`Password must be at least ${MIN_PASSWORD} characters.`);
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }
        if (!acceptTerms || !acceptMarketing) {
            setError("Please accept the terms and email updates to continue.");
            return;
        }
        setBusy(true);
        try {
            const clientIp = await getClientIp();
            await api<{ user: AuthUser }>("/setup/claim", {
                method: "POST",
                body: JSON.stringify({
                    email: email.trim(),
                    password,
                    name: name.trim(),
                    workspaceName: workspaceName.trim(),
                    acceptTerms,
                    acceptMarketing,
                    ...(clientIp ? { clientIp } : {}),
                }),
            });
            // Mark the instance claimed SYNCHRONOUSLY so the first-run gate updates
            // before we navigate (otherwise it keeps a stale `claimed:false` and
            // bounces /login <-> /welcome). Then refresh auth and continue to /setup.
            setSetupStatus({ claimed: true, hostname: status?.hostname ?? null });
            await refresh();
            router.replace("/setup");
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not complete setup. Please try again.");
            setBusy(false);
        }
    }

    const hostname = status?.hostname?.replace(/^https?:\/\//, "") ?? null;

    return (
        <div ref={scope} className="flex w-full justify-center">
            <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-grey-light bg-white shadow-[0_24px_60px_-34px_rgba(76,60,160,0.4)] dark:border-white/10 dark:bg-dark-1 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
                {/* ── Left: brand panel ───────────────────────────────────────── */}
                <aside className="flex flex-col gap-5 border-grey-light p-6 sm:p-8 lg:border-r dark:border-white/10">
                    <div className="hidden items-center justify-center pt-1 lg:flex">
                        <IdentityScene size={180} className="step-pop" />
                    </div>

                    <div>
                        <h1 className="step-heading font-poppins text-h3 font-extrabold leading-tight tracking-[-0.02em] text-black dark:text-white">
                            Welcome to Flow CMS 🎉
                        </h1>
                        <p className="step-sub mt-2 max-w-xs text-body-sm text-grey dark:text-white/65">
                            Create your admin account to finish setting up this instance. You&rsquo;ll only need to do this once.
                        </p>
                    </div>

                    <div className="step-fade hidden h-px bg-grey-light dark:bg-white/10 lg:block" />

                    <div className="hidden flex-col gap-4 lg:flex">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="step-stagger flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-white/[0.06] dark:text-lilac">
                                    {f.icon}
                                </span>
                                <div>
                                    <p className="text-body-sm font-semibold text-black dark:text-white">{f.title}</p>
                                    <p className="mt-0.5 text-caption-2 leading-relaxed text-grey dark:text-white/55">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="step-fade mt-auto hidden items-start gap-3 rounded-2xl bg-primary/[0.06] px-4 py-3 dark:bg-primary/10 lg:flex">
                        <span className="mt-0.5 shrink-0 text-primary dark:text-lilac" aria-hidden>✦</span>
                        <div>
                            <p className="text-body-sm font-semibold text-primary dark:text-lilac">Almost there!</p>
                            <p className="mt-0.5 text-caption-2 leading-relaxed text-grey dark:text-white/65">You&rsquo;re minutes away from a better way to manage content.</p>
                        </div>
                    </div>
                </aside>

                {/* ── Right: the form ─────────────────────────────────────────── */}
                <form onSubmit={onSubmit} className="flex flex-col gap-4 p-6 sm:p-8">
                    {error && (
                        <div className="step-stagger rounded-xl bg-error/10 px-4 py-3 text-body-sm font-medium text-error">{error}</div>
                    )}

                    {hostname && (
                        <div className="step-stagger">
                            <span className="mb-1.5 block text-caption-1 font-semibold text-black dark:text-white">Your Flow CMS address</span>
                            <div className="relative">
                                <span className={iconWrap}><GlobeIcon /></span>
                                <div className={cn(inputBase, "flex items-center bg-lavender-mist/40 text-grey dark:bg-white/[0.02] dark:text-white/55")}>{hostname}</div>
                            </div>
                            <span className="mt-1.5 block text-caption-2 text-grey dark:text-white/45">Set at install. Manage it from your host or DNS.</span>
                        </div>
                    )}

                    <Field label="Workspace name" icon={<BriefcaseIcon />}>
                        <input required value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className={inputBase} placeholder="Acme Inc." />
                    </Field>

                    <Field label="Your name" icon={<UserIcon />}>
                        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputBase} placeholder="Jane Doe" autoComplete="name" />
                    </Field>

                    <Field label="Email" icon={<MailIcon />}>
                        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputBase} placeholder="you@company.com" autoComplete="email" />
                    </Field>

                    <Field
                        label="Password"
                        icon={<LockIcon />}
                        trailing={
                            <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-grey transition-colors hover:text-black dark:text-white/40 dark:hover:text-white">
                                {showPw ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        }
                    >
                        <input type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className={cn(inputBase, "pr-11")} placeholder="At least 12 characters" autoComplete="new-password" />
                    </Field>

                    <Field
                        label="Confirm password"
                        icon={<LockIcon />}
                        trailing={
                            <button type="button" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? "Hide password" : "Show password"}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-grey transition-colors hover:text-black dark:text-white/40 dark:hover:text-white">
                                {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        }
                    >
                        <input type={showConfirm ? "text" : "password"} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={cn(inputBase, "pr-11")} placeholder="Re-enter your password" autoComplete="new-password" />
                    </Field>

                    <ConsentChecks
                        terms={acceptTerms}
                        marketing={acceptMarketing}
                        onTerms={setAcceptTerms}
                        onMarketing={setAcceptMarketing}
                        className="step-stagger"
                    />

                    <button
                        type="submit"
                        disabled={busy || !acceptTerms || !acceptMarketing}
                        className="step-stagger mt-1 inline-flex h-[52px] items-center justify-center gap-2.5 rounded-xl bg-[linear-gradient(120deg,#7A68F0_0%,#6C5CE7_55%,#5A4BD4_100%)] font-bold text-white shadow-glow transition-[transform,filter] hover:brightness-[1.06] active:scale-[0.99] disabled:opacity-60"
                    >
                        {busy ? (
                            "Setting up…"
                        ) : (
                            <>
                                <ShieldIcon s={18} />
                                Create admin &amp; continue
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h13m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </>
                        )}
                    </button>

                    <p className="step-fade mt-1 flex items-center justify-center gap-2 text-center text-caption-1 text-grey dark:text-white/45">
                        <LockIcon />
                        Your admin account gives you full access to manage your content.
                    </p>
                </form>
            </div>
        </div>
    );
}
