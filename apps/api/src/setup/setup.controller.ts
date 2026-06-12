import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { SESSION_COOKIE, sessionCookieOptions } from "../auth/constants";
import { Public } from "../auth/decorators";
import { SetupService } from "./setup.service";
import { ClaimDto } from "./dto";

@Controller("setup")
export class SetupController {
    constructor(private readonly setup: SetupService) {}

    /** Whether this instance has been claimed (an admin exists). Public so the
     *  studio can route a fresh install to the first-run wizard. */
    @Public()
    @Get("status")
    status() {
        return this.setup.status();
    }

    /** First-run: create the super admin and sign them in. Self-disables once the
     *  instance is claimed (409). Tightly rate-limited to blunt any race attempts. */
    @Public()
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @HttpCode(200)
    @Post("claim")
    async claim(@Body() dto: ClaimDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const { token, user } = await this.setup.claim(dto, { userAgent: req.headers["user-agent"], ip: req.ip });
        res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
        return { user };
    }
}
