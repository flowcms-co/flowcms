/**
 * Optional hook that lets the core auth layer enforce a workspace's access + session
 * policy WITHOUT depending on the commercial `ee/` code. The EE `ip_policies` module
 * provides this port; in Community it's absent and no policy applies. The
 * implementation must no-op unless the install is licensed for `ip_policies`.
 */
export const SESSION_POLICY_PORT = "SESSION_POLICY_PORT";

export interface SessionPolicyContext {
    /** Client IP for the request (undefined for non-HTTP contexts like sockets). */
    ip?: string;
    sessionCreatedAt: Date;
    lastSeenAt?: Date | null;
}

export interface SessionPolicyPort {
    /**
     * Throw when the request violates the workspace policy: ForbiddenException (403)
     * for a disallowed IP, UnauthorizedException (401) for an expired / idle session.
     * No-op unless licensed for `ip_policies`.
     */
    assertRequestAllowed(workspaceId: string, ctx: SessionPolicyContext): Promise<void>;
}
