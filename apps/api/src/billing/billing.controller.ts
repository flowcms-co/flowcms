import { Body, Controller, Get, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { RequirePermissions } from "../auth/decorators";
import { BillingService } from "./billing.service";

/**
 * Self-serve billing for the install's owner. Proxies to the vendor billing portal (the
 * studio never sees the Stripe secret). Gated behind SECURITY_MANAGE, like license setup.
 *   GET  /api/billing/portal → summary, card on file, invoices, publishable key.
 *   POST /api/billing/portal → { action } : setup-intent | set-default-method | change-plan
 *                              | cancel | resume | retry.
 */
@Controller("billing")
export class BillingController {
    constructor(private readonly billing: BillingService) {}

    @Get("portal")
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async summary(@Res() res: Response) {
        const { status, data } = await this.billing.portal("GET");
        res.status(status).json(data);
    }

    @Post("portal")
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async action(@Body() body: unknown, @Res() res: Response) {
        const { status, data } = await this.billing.portal("POST", body);
        res.status(status).json(data);
    }
}
