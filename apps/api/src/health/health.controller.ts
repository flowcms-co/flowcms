import { Controller, Get, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../auth/decorators";

@Controller("health")
@SkipThrottle() // uptime monitors / load balancers poll this; never rate-limit it
export class HealthController {
    constructor(private readonly prisma: PrismaService) {}

    @Public()
    @Get()
    async check(@Res({ passthrough: true }) res: Response) {
        let db = "down";
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            db = "up";
        } catch {
            db = "down";
        }
        // Return 503 when the DB is unreachable so load balancers / orchestrators
        // (Docker/compose/Railway/Render healthchecks key on HTTP status) pull a
        // broken instance out of rotation instead of keeping it live.
        res.status(db === "up" ? 200 : 503);
        return {
            status: db === "up" ? "ok" : "degraded",
            service: "flowcms-api",
            db,
            time: new Date().toISOString(),
        };
    }
}
