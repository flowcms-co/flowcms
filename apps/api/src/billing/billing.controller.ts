import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { RequirePermissions } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";

/** Where Stripe should return the buyer after checkout: the configured public studio URL, else
 *  the origin the request came from. Lands on the Plan & license tab. */
function returnBase(req: Request): string | undefined {
    const env = process.env.STUDIO_URL?.replace(/\/+$/, "");
    if (env) return env;
    const origin = req.headers.origin;
    return typeof origin === "string" && /^https?:\/\//.test(origin) ? origin.replace(/\/+$/, "") : undefined;
}

/**
 * Self-serve billing for the install's owner. Proxies to the vendor billing portal (the
 * studio never sees the Stripe secret). Gated behind SECURITY_MANAGE, like license setup.
 *   GET  /api/billing/portal   → summary, card on file, invoices, publishable key.
 *   POST /api/billing/portal   → { action } : setup-intent | set-default-method | change-plan
 *                                | cancel | resume | retry | set-seats.
 *   POST /api/billing/checkout → { interval, seats } : start a Pro subscription for this install.
 */
@Controller("billing")
export class BillingController {
    constructor(
        private readonly billing: BillingService,
        private readonly prisma: PrismaService,
    ) {}

    @Get("portal")
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async summary(@Res() res: Response) {
        const { status, data } = await this.billing.portal("GET");
        // Seats are install-wide, so report the install's total user count (same number the
        // invite gate enforces), not just the current workspace's members.
        if (status === 200 && data && typeof data === "object") {
            (data as Record<string, unknown>).installUsers = await this.prisma.user.count().catch(() => null);
        }
        res.status(status).json(data);
    }

    @Post("portal")
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async action(@Body() body: unknown, @Res() res: Response) {
        const { status, data } = await this.billing.portal("POST", body);
        res.status(status).json(data);
    }

    /** Start a Pro checkout for this install and return the Stripe URL to redirect to. */
    @Post("checkout")
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async checkout(@Body() body: { interval?: string; seats?: number }, @Req() req: Request, @Res() res: Response) {
        const interval: "month" | "year" = body?.interval === "year" ? "year" : "month";
        const seats = Math.max(1, Math.round(Number(body?.seats) || 3));
        const base = returnBase(req);
        const { status, data } = await this.billing.checkout({ interval, seats, returnUrl: base ? `${base}/settings/plan` : undefined });
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
