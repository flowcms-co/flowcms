"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_ROLE, mapBackendRole, ROLES, type Role, type RoleMeta } from "@/lib/roles";
import { useAuth } from "@/components/providers/AuthProvider";

type RoleContextValue = {
    /** Effective role driving the UI (the viewed role for a Super Admin). */
    role: Role;
    meta: RoleMeta;
    /** The signed-in user's actual role (unaffected by "view as"). */
    realRole: Role;
    /** Whether the signed-in user may switch views (Super Admin only). */
    canSwitchView: boolean;
    /** The role currently being previewed, or null when viewing as themselves. */
    viewAs: Role | null;
    /** Super Admin only: preview the app as another role (no-op otherwise). */
    setRole: (role: Role) => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);

/**
 * Derives the UI role + display meta from the authenticated user. A Super Admin
 * can preview the app as any other role ("view as") — a front-end-only overlay;
 * the backend still enforces their real permissions on every request.
 */
export function RoleProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const realRole: Role = user ? mapBackendRole(user.role.key, user.role.dashboard) : DEFAULT_ROLE;
    const canSwitchView = realRole === "super";

    const [viewAs, setViewAs] = useState<Role | null>(null);
    const role: Role = canSwitchView && viewAs ? viewAs : realRole;
    const base = ROLES[role];

    const previewing = canSwitchView && viewAs !== null && viewAs !== realRole;
    const meta: RoleMeta = user
        ? {
              id: role,
              label: previewing ? `Viewing as ${ROLES[role].label}` : user.title || user.role.name,
              description: base.description,
              user: {
                  name: user.name || user.email,
                  email: user.email,
                  avatar: base.user.avatar,
              },
          }
        : base;

    const setRole = (next: Role) => {
        if (!canSwitchView) return;
        setViewAs(next === realRole ? null : next);
    };

    return (
        <RoleContext.Provider value={{ role, meta, realRole, canSwitchView, viewAs, setRole }}>
            {children}
        </RoleContext.Provider>
    );
}

export function useRole() {
    const ctx = useContext(RoleContext);
    if (!ctx) {
        throw new Error("useRole must be used within a RoleProvider");
    }
    return ctx;
}
