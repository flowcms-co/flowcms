import { AuditExportModule } from "./audit-export/audit-export.module";
import { AiBudgetsModule } from "./ai-budgets/ai-budgets.module";
import { MultiWorkspaceModule } from "./multi-workspace/multi-workspace.module";
import { WhiteLabelModule } from "./white-label/white-label.module";
import { ApprovalWorkflowsModule } from "./approval-workflows/approval-workflows.module";
import { AdvancedRbacModule } from "./advanced-rbac/advanced-rbac.module";
import { IpPoliciesModule } from "./ip-policies/ip-policies.module";
import { ScimModule } from "./scim/scim.module";
import { SsoModule } from "./sso/sso.module";
import { SeoAutomationModule } from "./seo-automation/seo-automation.module";

/**
 * Commercial (EE) Nest modules. Loaded conditionally by app.module via a
 * try/require, so an open-source build that removes the `ee/` directory simply
 * has no paid modules — there's nothing to flip. Every route inside is still
 * gated at runtime by FeatureGuard (license entitlement), so even with the code
 * present, a Community install can't use it.
 *
 * This directory is licensed COMMERCIALLY (see ee/LICENSE), not under the OSS
 * license that covers the rest of the repo.
 */
export const EE_MODULES = [
    AuditExportModule,
    AiBudgetsModule,
    MultiWorkspaceModule,
    WhiteLabelModule,
    ApprovalWorkflowsModule,
    AdvancedRbacModule,
    IpPoliciesModule,
    ScimModule,
    SsoModule,
    SeoAutomationModule,
];
