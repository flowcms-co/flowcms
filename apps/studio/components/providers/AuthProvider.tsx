"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

export type AuthUser = {
    id: string;
    email: string;
    name: string | null;
    title: string | null;
    avatarUrl?: string | null;
    avatarStyle?: string | null;
    avatarBg?: string | null;
    twoFactorEnabled?: boolean;
    /** Terms acceptance timestamp; null = the one-time consent prompt shows. */
    termsAcceptedAt?: string | null;
    workspaceId: string;
    role: {
        id: string;
        key: string;
        name: string;
        permissions: string[];
        dashboard: string | null;
        /** Pro advanced_rbac field-level rules (enforced only when licensed). */
        lockSeoMeta?: boolean;
        allowedTypeIds?: string[];
    };
};

type AuthStatus = "loading" | "authenticated" | "guest";

type AuthContextValue = {
    user: AuthUser | null;
    status: AuthStatus;
    signin: (email: string, password: string, code?: string) => Promise<{ twoFactorRequired?: boolean }>;
    signout: () => Promise<void>;
    refresh: () => Promise<void>;
    can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [status, setStatus] = useState<AuthStatus>("loading");

    const refresh = useCallback(async () => {
        try {
            // /auth/me answers 200 for everyone: `user` is null when anonymous.
            const { user } = await api<{ user: AuthUser | null }>("/auth/me");
            setUser(user ?? null);
            setStatus(user ? "authenticated" : "guest");
        } catch {
            setUser(null);
            setStatus("guest");
        }
    }, []);

    useEffect(() => {
        // Load the current session once on mount. The setState happens after the
        // awaited fetch (not synchronously), so this is the intended pattern for
        // syncing auth state from the external API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refresh();
    }, [refresh]);

    const signin = useCallback(async (email: string, password: string, code?: string) => {
        const res = await api<{ user?: AuthUser; twoFactorRequired?: boolean }>("/auth/signin", {
            method: "POST",
            body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
        });
        // 2FA-enabled account: the caller should prompt for a code and call again.
        if (res.twoFactorRequired) return { twoFactorRequired: true };
        setUser(res.user ?? null);
        setStatus("authenticated");
        return {};
    }, []);

    const signout = useCallback(async () => {
        try {
            await api("/auth/signout", { method: "POST" });
        } finally {
            setUser(null);
            setStatus("guest");
        }
    }, []);

    const can = useCallback(
        (permission: string) => {
            const perms = user?.role.permissions ?? [];
            return perms.includes("*") || perms.includes(permission);
        },
        [user],
    );

    return (
        <AuthContext.Provider value={{ user, status, signin, signout, refresh, can }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
    return ctx;
}
