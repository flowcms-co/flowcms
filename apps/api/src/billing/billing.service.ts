import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TelemetryService } from "../telemetry/telemetry.service";

/**
 * Bridges the studio to the vendor's billing portal API. The signed license token never
 * leaves the server: this reads it (env or DB, same precedence as LicenseService) and
 * forwards each billing request to the admin console with `Authorization: Bearer <token>`.
 * The admin verifies the token (Ed25519) and scopes every action to this install's
 * subscription, so the studio frontend can manage billing without ever holding a secret.
 */
@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);
    // Operator-configured, trusted endpoint (not user input) — a plain fetch is fine here.
    private readonly adminUrl = (process.env.FLOWCMS_ADMIN_URL || "https://admin.flowcms.co").replace(/\/+$/, "");

    constructor(
        private readonly prisma: PrismaService,
        private readonly telemetry: TelemetryService,
    ) {}

    /**
     * Start a Pro checkout for THIS install. Stamps the install's own instanceId (so the new
     * subscription binds here and the next heartbeat auto-activates the license) and a returnUrl
     * (so Stripe sends the buyer back to this studio). No license token needed — this is the
     * on-ramp for a Community install that has no subscription yet. Returns the Stripe URL.
     */
    async checkout(opts: { interval: "month" | "year"; seats: number; returnUrl?: string }): Promise<{ status: number; data: unknown }> {
        try {
            const instanceId = await this.telemetry.instanceId();
            const res = await fetch(`${this.adminUrl}/api/billing/checkout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ interval: opts.interval, seats: opts.seats, instanceId, returnUrl: opts.returnUrl }),
            });
            const data = await res.json().catch(() => ({}));
            return { status: res.status, data };
        } catch (e) {
            this.logger.warn(`Billing checkout proxy failed: ${(e as Error).message}`);
            return { status: 502, data: { error: "Could not reach the billing service." } };
        }
    }

    private async licenseToken(): Promise<string | null> {
        const env = process.env.FLOWCMS_LICENSE_KEY?.trim();
        if (env) return env;
        const row = await this.prisma.license.findFirst({ orderBy: { updatedAt: "desc" } }).catch(() => null);
        return row?.key?.trim() || null;
    }

    /** Fetch a FlowCMS-branded invoice PDF from the admin, forwarding the license token. */
    async invoicePdf(id: string): Promise<{ status: number; body: Buffer | string; contentType: string }> {
        const token = await this.licenseToken();
        if (!token) return { status: 400, body: "No license configured.", contentType: "text/plain" };
        try {
            const res = await fetch(`${this.adminUrl}/api/billing/portal/invoice?id=${encodeURIComponent(id)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return { status: res.status, body: await res.text().catch(() => "Invoice error."), contentType: "application/json" };
            return { status: 200, body: Buffer.from(await res.arrayBuffer()), contentType: "application/pdf" };
        } catch (e) {
            this.logger.warn(`Invoice PDF proxy failed: ${(e as Error).message}`);
            return { status: 502, body: "Could not reach the billing service.", contentType: "text/plain" };
        }
    }

    /** Proxy a billing-portal call to the admin, returning its status + JSON verbatim. */
    async portal(method: "GET" | "POST", body?: unknown): Promise<{ status: number; data: unknown }> {
        const token = await this.licenseToken();
        if (!token) return { status: 400, data: { error: "This install has no license, so there's no subscription to manage." } };
        try {
            const res = await fetch(`${this.adminUrl}/api/billing/portal`, {
                method,
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
            });
            const data = await res.json().catch(() => ({}));
            return { status: res.status, data };
        } catch (e) {
            this.logger.warn(`Billing portal proxy failed: ${(e as Error).message}`);
            return { status: 502, data: { error: "Could not reach the billing service." } };
        }
    }
}
