import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LicenseService } from "./license.service";
import { LicenseController } from "./license.controller";
import { FeatureGuard } from "./feature.guard";

/** Global so the paid ee/ modules (and the FeatureGuard) can inject LicenseService. */
@Global()
@Module({
    imports: [PrismaModule],
    controllers: [LicenseController],
    providers: [LicenseService, FeatureGuard],
    exports: [LicenseService, FeatureGuard],
})
export class LicenseModule {}
