import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
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

    /** Stream a FlowCMS-branded invoice PDF (GET so it opens/downloads from a link). */
    @Get("portal/invoice/:id")
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async invoice(@Param("id") id: string, @Res() res: Response) {
        const { status, body, contentType } = await this.billing.invoicePdf(id);
        res.status(status).setHeader("Content-Type", contentType);
        if (Buffer.isBuffer(body)) {
            res.setHeader("Content-Disposition", `inline; filename="flowcms-invoice-${id}.pdf"`);
            res.end(body);
        } else {
            res.send(body);
        }
    }
}
