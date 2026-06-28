"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/shell/Sidebar";
import Topbar from "@/components/shell/Topbar";
import MobileTabBar from "@/components/shell/MobileTabBar";
import BrandStyle from "@/components/shell/BrandStyle";
import { InstallAppBanner } from "@/components/install/InstallApp";
import JobToasts from "@/components/jobs/JobToasts";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/lib/useWorkspace";

const STORE_KEY = "flow-nav-collapsed";
const CHANGE_EVENT = "flow-nav-collapsed-change";

/**
 * Persisted nav-collapse preference, read via useSyncExternalStore so the value
 * is hydration-safe: the server snapshot is always `false` (expanded), so the
 * initial client render matches the server, and React re-reads localStorage
 * after hydration. A custom event keeps same-tab updates in sync; the native
 * `storage` event syncs across tabs. (Reading localStorage during the initial
 * render instead would cause a server/client mismatch.)
 */
const subscribe = (cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(CHANGE_EVENT, cb);
    return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener(CHANGE_EVENT, cb);
    };
};
const getSnapshot = () => {
    try {
        return window.localStorage.getItem(STORE_KEY) === "1";
    } catch {
        return false;
    }
};
const getServerSnapshot = () => false;

/**
 * App shell: fixed sidebar + topbar + scrolling content.
 * - <1024px: sidebar slides over content behind a dimmed overlay (mobileOpen).
 * - ≥1024px: sidebar can collapse to icons-only (collapsed) to give screens
 *   like the block editor more room. Collapse state persists in localStorage.
 */
const AppShell = ({ children }: { children: ReactNode }) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const collapsed = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot,
    );

    const toggleCollapse = () => {
        try {
            window.localStorage.setItem(STORE_KEY, collapsed ? "0" : "1");
        } catch {
            // ignore storage failures (private mode, etc.)
        }
        window.dispatchEvent(new Event(CHANGE_EVENT));
    };

    // Route guard: send unauthenticated visitors to the login page.
    const { status, user } = useAuth();
    const router = useRouter();
    useEffect(() => {
        if (status === "guest") router.replace("/login");
    }, [status, router]);

    // First-run guard: send a manager into the guided setup until it's completed.
    const ws = useWorkspace();
    useEffect(() => {
        if (status !== "authenticated" || !ws || !user) return;
        const isManager = user.role.key === "super_admin" || user.role.key === "admin";
        if (isManager && !ws.onboardedAt) router.replace("/setup");
    }, [status, ws, user, router]);

    if (status !== "authenticated") {
        return (
            <div className="grid min-h-screen place-items-center">
                <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
            </div>
        );
    }

    return (
        // Flex row so the sidebar is an in-flow column on desktop (sticky, full
        // height) rather than position:fixed. Fixed sidebars render in the wrong
        // place in full-page (stitched) screenshots; an in-flow sticky column
        // captures correctly while staying pinned during scroll.
        <div className="flex min-h-screen">
            {/* White-label accent override (only emits when licensed + configured). */}
            <BrandStyle />
            <Sidebar
                show={mobileOpen}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
                onNavigate={() => setMobileOpen(false)}
            />

            {/* Mobile overlay (above the sticky header + bottom tab bar) */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 block bg-ink/40 backdrop-blur-sm lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <div className="flex min-w-0 flex-1 flex-col">
                <Topbar onMenu={() => setMobileOpen(true)} />
                {/* pb-tabbar keeps content clear of the fixed mobile tab bar; reset at lg. */}
                <main className="pb-tabbar mx-auto w-full max-w-[90rem] px-4 pt-5 md:px-6 md:pt-8 xl:px-8 lg:pb-8">
                    {children}
                </main>
            </div>
            <MobileTabBar />
            <InstallAppBanner />
            <JobToasts />
        </div>
    );
};

export default AppShell;
