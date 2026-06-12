import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { verifyLicense, type LicensePlan } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";

export type LicenseInfo = {
    valid: boolean; // validly signed AND not expired
    plan: LicensePlan;
    features: string[];
    seats: number | null;
    expiresAt: string | null;
    expired: boolean;
    customer: string | null;
    source: "env" | "db" | "none";
};

const COMMUNITY: LicenseInfo = {
    valid: true,
    plan: "community",
    features: [],
    seats: null,
    expiresAt: null,
    expired: false,
    customer: null,
    source: "none",
};

/**
 * Reads + verifies the install's commercial license (open-core gate).
 * Precedence: FLOWCMS_LICENSE_KEY env → newest DB License row → Community.
 * `has(feature)` is the single check the paid @flowcms/ee modules gate on.
 */
@Injectable()
export class LicenseService {
    private readonly logger = new Logger(LicenseService.name);
    private cache: LicenseInfo | null = null;
    private cacheAt = 0;
    // Re-read the license periodically so an expiry that falls AFTER first load
    // doesn't keep EE features unlocked until a restart (SECURITY_AUDIT_REPORT F-07).
    private readonly CACHE_TTL_MS = 5 * 60_000;

    constructor(private readonly prisma: PrismaService) {}

    /** The Ed25519 public key used to verify license signatures. Defaults to the
     *  key embedded in @flowcms/shared, but can be overridden with the
     *  LICENSE_PUBLIC_KEY env var so a deployment can pin the production key
     *  without a code change (verifyLicense falls back to the embedded key when
     *  this returns undefined). */
    private publicKey(): string | undefined {
        return process.env.LICENSE_PUBLIC_KEY?.trim() || undefined;
    }

    private async load(): Promise<LicenseInfo> {
        const envKey = process.env.FLOWCMS_LICENSE_KEY?.trim();
        let token = envKey ?? "";
        let source: LicenseInfo["source"] = envKey ? "env" : "none";
        if (!token) {
            const row = await this.prisma.license.findFirst({ orderBy: { updatedAt: "desc" } }).catch(() => null);
            if (row?.key) {
                token = row.key;
                source = "db";
            }
        }
        if (!token) return { ...COMMUNITY };

        const payload = verifyLicense(token, this.publicKey());
        if (!payload) {
            this.logger.warn("A license key is present but its signature is invalid — running as Community.");
            return { ...COMMUNITY, source };
        }
        const expired = !!payload.exp && payload.exp < Date.now();
        return {
            valid: !expired,
            plan: payload.plan,
            features: payload.features,
            seats: payload.seats ?? null,
            expiresAt: payload.exp ? new Date(payload.exp).toISOString() : null,
            expired,
            customer: payload.customer ?? null,
            source,
        };
    }

    private async get(): Promise<LicenseInfo> {
        if (!this.cache || Date.now() - this.cacheAt > this.CACHE_TTL_MS) {
            this.cache = await this.load();
            this.cacheAt = Date.now();
        }
        return this.cache;
    }

    async refresh(): Promise<LicenseInfo> {
        this.cache = await this.load();
        this.cacheAt = Date.now();
        return this.cache;
    }

    async info(): Promise<LicenseInfo> {
        return this.get();
    }

    /** Is a paid feature unlocked on this install? Community → always false. */
    async has(feature: string): Promise<boolean> {
        const i = await this.get();
        if (!i.valid) return false;
        // Defensive re-check against the wall clock: even within the cache window, a
        // license whose expiry just passed must stop unlocking features (F-07).
        if (i.expiresAt && Date.parse(i.expiresAt) < Date.now()) return false;
        return i.features.includes("*") || i.features.includes(feature);
    }

    /** Validate + persist a key (signature checked first), then activate it. */
    async setKey(key: string): Promise<LicenseInfo> {
        const trimmed = key.trim();
        if (!verifyLicense(trimmed, this.publicKey())) {
            throw new BadRequestException("That license key is invalid or not signed by Flow CMS.");
        }
        await this.prisma.$transaction([
            this.prisma.license.deleteMany({}),
            this.prisma.license.create({ data: { key: trimmed } }),
        ]);
        return this.refresh();
    }

    /** Remove the stored license (revert to Community). */
    async clear(): Promise<LicenseInfo> {
        await this.prisma.license.deleteMany({});
        return this.refresh();
    }
}
