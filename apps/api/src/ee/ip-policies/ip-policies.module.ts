import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SESSION_POLICY_PORT } from "../../auth/session-policy.port";
import { IpPoliciesController } from "./ip-policies.controller";
import { IpPoliciesService } from "./ip-policies.service";

/**
 * Global so the core auth layer can inject SESSION_POLICY_PORT without importing
 * this commercial module. LicenseService comes from the global LicenseModule.
 */
@Global()
@Module({
    imports: [PrismaModule],
    controllers: [IpPoliciesController],
    providers: [IpPoliciesService, { provide: SESSION_POLICY_PORT, useExisting: IpPoliciesService }],
    exports: [SESSION_POLICY_PORT],
})
export class IpPoliciesModule {}
