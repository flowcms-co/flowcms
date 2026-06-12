/**
 * Edition catalog — the single front-end source of truth for what each plan
 * unlocks. It mirrors the backend license contract (`GET /license` →
 * `{ plan, features }`, where `has(feature)` is true when `features` includes
 * "*" or the key). Community ships `features: []`, so every paid key below is
 * locked until a Pro / Enterprise license is activated.
 *
 * Keep the keys here in lockstep with `apps/api` (LicenseService / @flowcms/ee)
 * and `templates/settings/License.tsx`.
 */

export type Plan = "community" | "pro" | "enterprise";

export const PLAN_RANK: Record<Plan, number> = { community: 0, pro: 1, enterprise: 2 };
export const PLAN_LABEL: Record<Plan, string> = {
    community: "Community",
    pro: "Pro",
    enterprise: "Enterprise",
};

/** Paid entitlement keys, each tagged with the tier that introduces it. */
export type FeatureKey =
    | "advanced_rbac"
    | "approval_workflows"
    | "audit_export"
    | "white_label"
    | "ai_budgets"
    | "slack"
    | "live_editor"
    | "sso"
    | "scim"
    | "multi_workspace"
    | "ip_policies"
    | "seo_automation";

export const FEATURE_TIER: Record<FeatureKey, Plan> = {
    advanced_rbac: "pro",
    approval_workflows: "pro",
    audit_export: "pro",
    white_label: "enterprise",
    ai_budgets: "pro",
    slack: "pro",
    live_editor: "pro",
    sso: "enterprise",
    scim: "enterprise",
    multi_workspace: "enterprise",
    ip_policies: "enterprise",
    seo_automation: "pro",
};

export const FEATURE_LABEL: Record<FeatureKey, string> = {
    advanced_rbac: "Custom roles & field-level permissions",
    approval_workflows: "Approval workflows",
    audit_export: "Audit log export (CSV / SIEM)",
    white_label: "White-label & custom branding",
    ai_budgets: "AI budgets & spend caps",
    slack: "Slack notifications",
    live_editor: "Visual / live page editor",
    sso: "Single sign-on (SAML / OIDC)",
    scim: "SCIM user provisioning",
    multi_workspace: "Multi-workspace console",
    ip_policies: "IP allowlists & session policy",
    seo_automation: "Scheduled AI auditing",
};

/** Comparison cards for the Billing tab. Prices are placeholders for the vendor to set. */
export type PlanCard = {
    id: Plan;
    name: string;
    price: string;
    cadence: string;
    tagline: string;
    highlights: string[];
};

export const PLANS: PlanCard[] = [
    {
        id: "community",
        name: "Community",
        price: "Free",
        cadence: "self-hosted, forever",
        tagline: "The complete CMS, open-source. Everything you need to ship a site.",
        highlights: [
            "Headless CMS: collections, components, versioning",
            "REST, GraphQL & Strapi-compatible APIs",
            "AI writing suite (bring your own key)",
            "Full SEO & AEO suite",
            "Media library & object storage",
            "Webhooks, importers & localization",
            "Two-factor auth & audit log",
        ],
    },
    {
        id: "pro",
        name: "Pro",
        price: "Paid",
        cadence: "per workspace",
        tagline: "For teams that need governance, review workflows, and cost guardrails.",
        highlights: [
            "Everything in Community, plus:",
            FEATURE_LABEL.advanced_rbac,
            FEATURE_LABEL.approval_workflows,
            FEATURE_LABEL.live_editor,
            FEATURE_LABEL.audit_export,
            FEATURE_LABEL.ai_budgets,
            FEATURE_LABEL.slack,
        ],
    },
    {
        id: "enterprise",
        name: "Enterprise",
        price: "Custom",
        cadence: "volume & SLA",
        tagline: "Identity, isolation, branding, and policy controls for larger organizations.",
        highlights: [
            "Everything in Pro, plus:",
            FEATURE_LABEL.white_label,
            FEATURE_LABEL.sso + " & " + FEATURE_LABEL.scim,
            FEATURE_LABEL.multi_workspace,
            FEATURE_LABEL.ip_policies,
            "Priority support & SLA",
        ],
    },
];

/** The cheapest plan that unlocks a feature (for "Upgrade to X" copy). */
export const tierForFeature = (feature: FeatureKey): Plan => FEATURE_TIER[feature];
