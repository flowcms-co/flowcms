import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TelemetryModule } from "../telemetry/telemetry.module";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";

@Module({
    imports: [PrismaModule, TelemetryModule],
    controllers: [BillingController],
    providers: [BillingService],
    exports: [BillingService],
})
export class BillingModule {}
