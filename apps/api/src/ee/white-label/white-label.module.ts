import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { WhiteLabelController } from "./white-label.controller";

/** EE (Enterprise) white-label branding. LicenseService (FeatureGuard) is global. */
@Module({
    imports: [PrismaModule],
    controllers: [WhiteLabelController],
})
export class WhiteLabelModule {}
