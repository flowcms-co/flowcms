import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MultiWorkspaceController } from "./multi-workspace.controller";
import { MultiWorkspaceService } from "./multi-workspace.service";

/**
 * EE (Enterprise) multi-workspace provisioning. LicenseService (for FeatureGuard)
 * comes from the global LicenseModule; PrismaService from the global PrismaModule.
 */
@Module({
    imports: [PrismaModule],
    controllers: [MultiWorkspaceController],
    providers: [MultiWorkspaceService],
})
export class MultiWorkspaceModule {}
