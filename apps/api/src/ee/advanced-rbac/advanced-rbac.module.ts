import { Global, Module } from "@nestjs/common";
import { RBAC_PORT } from "../../content/rbac.port";
import { AdvancedRbacService } from "./advanced-rbac.service";

/**
 * Global so the core content engine can inject RBAC_PORT for field-level
 * enforcement without importing this commercial module. LicenseService comes from
 * the global LicenseModule. No controller — the rule config rides the core roles
 * endpoint; this module only provides the (license-checked) enforcement.
 */
@Global()
@Module({
    providers: [AdvancedRbacService, { provide: RBAC_PORT, useExisting: AdvancedRbacService }],
    exports: [RBAC_PORT],
})
export class AdvancedRbacModule {}
