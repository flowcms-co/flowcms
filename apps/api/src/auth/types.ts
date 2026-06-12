/** The authenticated principal attached to each request by AuthGuard. */
export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    title: string | null;
    avatarUrl: string | null;
    avatarStyle: string | null;
    avatarBg: string | null;
    twoFactorEnabled: boolean;
    workspaceId: string;
    role: {
        id: string;
        key: string;
        name: string;
        permissions: string[];
        dashboard: string | null;
        /** Pro (advanced_rbac) field-level rules — enforced only when licensed. */
        lockSeoMeta: boolean;
        allowedTypeIds: string[];
    };
}
