import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TelemetryService } from "./telemetry.service";
import { TelemetryController } from "./telemetry.controller";

@Module({
    imports: [PrismaModule],
    controllers: [TelemetryController],
    providers: [TelemetryService],
    exports: [TelemetryService],
})
export class TelemetryModule {}
