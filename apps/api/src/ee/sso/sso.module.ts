import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SsoController } from "./sso.controller";
import { SsoAuthController } from "./sso-auth.controller";
import { SsoService } from "./sso.service";

/** EE (Enterprise) OIDC single sign-on. LicenseService (FeatureGuard) is global. */
@Module({
    imports: [PrismaModule],
    controllers: [SsoController, SsoAuthController],
    providers: [SsoService],
})
export class SsoModule {}
