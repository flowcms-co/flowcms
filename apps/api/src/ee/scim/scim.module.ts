import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ScimController } from "./scim.controller";
import { ScimAdminController } from "./scim-admin.controller";
import { ScimService } from "./scim.service";

/** EE (Enterprise) SCIM 2.0 provisioning. LicenseService (ScimGuard / FeatureGuard) is global. */
@Module({
    imports: [PrismaModule],
    controllers: [ScimController, ScimAdminController],
    providers: [ScimService],
})
export class ScimModule {}
