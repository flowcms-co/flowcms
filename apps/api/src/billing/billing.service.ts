import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
    private readonly adminUrl = (process.env.FLOWCMS_ADMIN_URL || "https://flowcms-admin-production.up.railway.app").replace(/\/+$/, "");

    constructor(private readonly prisma: PrismaService) {}

    private async licenseToken(): Promise<string | null> {
        const env = process.env.FLOWCMS_LICENSE_KEY?.trim();
        if (env) return env;
        const row = await this.prisma.license.findFirst({ orderBy: { updatedAt: "desc" } }).catch(() => null);
        return row?.key?.trim() || null;
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
