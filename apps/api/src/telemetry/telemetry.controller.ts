import { Controller, Get, Post } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { RequirePermissions } from "../auth/decorators";
import { TelemetryService } from "./telemetry.service";

/** Ops view + manual trigger for the telemetry/license heartbeat (admins only). */
@Controller("telemetry")
export class TelemetryController {
    constructor(private readonly telemetry: TelemetryService) {}

    @Get()
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async info() {
        return { instanceId: await this.telemetry.instanceId() };
    }

    @Post("beat")
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async beat() {
        return this.telemetry.beat();
    }
}
