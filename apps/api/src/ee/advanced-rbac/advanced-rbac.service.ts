import { Injectable } from "@nestjs/common";
import { LicenseService } from "../../license/license.service";
import type { RbacPort, RoleRules } from "../../content/rbac.port";

/** Data keys the SEO/metadata editors write — locked when a role can't edit meta. */
const SEO_KEYS = ["metaTitle", "metaDescription", "focusKeyword", "jsonLdType", "canonical", "robots"];

/**
 * EE (Pro) — advanced RBAC field-level enforcement. Implements the core RbacPort:
 * restricts a role to specific content types and strips SEO/metadata fields a role
 * may not edit. No-ops unless the install is licensed for `advanced_rbac`, so the
 * role rules are inert on Community.
 */
@Injectable()
export class AdvancedRbacService implements RbacPort {
    constructor(private readonly license: LicenseService) {}

    async allowedTypeIds(role: RoleRules): Promise<string[] | null> {
        if (!(await this.license.has("advanced_rbac"))) return null;
        const ids = role.allowedTypeIds ?? [];
        return ids.length ? ids : null;
    }

    async stripLockedFields(role: RoleRules, data: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!role.lockSeoMeta) return data;
        if (!(await this.license.has("advanced_rbac"))) return data;
        const out = { ...data };
        for (const k of SEO_KEYS) delete out[k];
        return out;
    }
}
