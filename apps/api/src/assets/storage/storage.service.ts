import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { IntegrationType, type Integration } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { AuthUser } from "../../auth/types";
import { assertPublicEndpoint } from "../../common/ssrf";
import { MEDIA_DIR, createStorage, s3Configured } from "./env";
import { LocalStorageDriver } from "./local.driver";
import { S3StorageDriver, type S3Options } from "./s3.driver";
import type { StorageDriver } from "./storage.driver";

export type StorageInput = {
    endpoint?: string;
    region?: string;
    bucket: string;
    publicUrl?: string;
    forcePathStyle?: boolean;
    /** Blank keeps the stored keys, or copies the env keys on a first save. */
    accessKeyId?: string;
    secretAccessKey?: string;
};

type Config = { endpoint?: string; region: string; bucket: string; publicUrl?: string; forcePathStyle: boolean; accessKeyHint: string };
type Keys = { accessKeyId: string; secretAccessKey: string };

const REFRESH_MS = 60_000;
const hint = (id: string) => `…${id.slice(-4)}`;

/**
 * The active media store. Order: S3 credentials saved in Studio (one per install,
 * the secret encrypted with SECRETS_ENCRYPTION_KEY like every other integration),
 * then the S3_* env vars, then local disk. Moving the keys out of env means a leak
 * of the host's env vars alone no longer exposes the bucket.
 *
 * Delegates every call to the current driver, so saving new keys takes effect
 * without a restart. Other replicas pick the change up within a minute.
 */
@Injectable()
export class StorageService implements StorageDriver, OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger(StorageService.name);
    private driver: StorageDriver = this.envDriver();
    private source: "studio" | "env" | "local" = this.envSource();
    private stamp: string | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: AuditService,
    ) {}

    async onModuleInit() {
        await this.refresh();
        this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
        this.timer.unref?.();
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    put(key: string, body: Buffer, contentType: string) {
        return this.driver.put(key, body, contentType);
    }
    read(key: string) {
        return this.driver.read(key);
    }
    delete(...keys: string[]) {
        return this.driver.delete(...keys);
    }
    publicUrl(key: string) {
        return this.driver.publicUrl(key);
    }

    /** The env-configured store. STORAGE_DRIVER=s3 with the key vars deleted (keys
     *  moved into Studio) must not stop boot, so it falls back to local disk until
     *  refresh() loads the saved keys. */
    private envDriver(): StorageDriver {
        try {
            return createStorage();
        } catch (err) {
            this.log.warn(`${(err as Error).message}. Using local disk unless storage keys are saved in Studio.`);
            return new LocalStorageDriver(MEDIA_DIR);
        }
    }

    private envSource(): "env" | "local" {
        return this.driver instanceof S3StorageDriver ? "env" : "local";
    }

    private row() {
        return this.prisma.integration.findFirst({ where: { type: IntegrationType.STORAGE }, orderBy: { createdAt: "asc" } });
    }

    private options(row: Integration): S3Options {
        const c = row.config as Config;
        const k = JSON.parse(decryptSecret(row.encryptedSecret!)) as Keys;
        return { endpoint: c.endpoint || undefined, region: c.region || "auto", bucket: c.bucket, publicUrl: c.publicUrl || undefined, forcePathStyle: c.forcePathStyle !== false, ...k };
    }

    /** Swap drivers when the saved row changed. Fails soft: a bad row keeps the current driver. */
    async refresh() {
        try {
            const row = await this.row();
            const stamp = row ? row.updatedAt.toISOString() : null;
            if (stamp === this.stamp) return;
            if (row) {
                this.driver = new S3StorageDriver(this.options(row));
                this.source = "studio";
            } else {
                this.driver = this.envDriver();
                this.source = this.envSource();
            }
            this.stamp = stamp;
        } catch (err) {
            this.log.error(`Saved storage settings could not be loaded; keeping the current store. ${(err as Error).message}`);
        }
    }

    /** Never includes a secret: only the last 4 characters of the access key id. */
    async status() {
        const row = await this.row();
        const c = (row?.config ?? null) as Config | null;
        const env = {
            endpoint: process.env.S3_ENDPOINT || "",
            region: process.env.S3_REGION || "auto",
            bucket: process.env.S3_BUCKET || "",
            publicUrl: process.env.S3_PUBLIC_URL || "",
            forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") !== "false",
            accessKeyHint: process.env.S3_ACCESS_KEY_ID ? hint(process.env.S3_ACCESS_KEY_ID) : "",
        };
        return {
            source: this.source,
            saved: c ? { endpoint: c.endpoint ?? "", region: c.region, bucket: c.bucket, publicUrl: c.publicUrl ?? "", forcePathStyle: c.forcePathStyle, accessKeyHint: c.accessKeyHint, updatedAt: row!.updatedAt } : null,
            // Pre-fills the form, and tells the operator which env vars to delete once saved.
            env: s3Configured() ? env : null,
        };
    }

    private requireOwner(user: AuthUser) {
        // Storage serves every workspace on the install, so a workspace admin can't change it.
        if (user.role.key !== "super_admin") throw new ForbiddenException("Only a Super Admin can change media storage.");
    }

    async save(user: AuthUser, input: StorageInput) {
        this.requireOwner(user);
        const bucket = input.bucket?.trim();
        if (!bucket) throw new BadRequestException("Bucket is required.");
        const existing = await this.row();
        let keys: Keys | null = input.accessKeyId?.trim() && input.secretAccessKey ? { accessKeyId: input.accessKeyId.trim(), secretAccessKey: input.secretAccessKey } : null;
        if (!keys && existing?.encryptedSecret) keys = JSON.parse(decryptSecret(existing.encryptedSecret)) as Keys;
        if (!keys && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) keys = { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY };
        if (!keys) throw new BadRequestException("Enter the access key ID and secret access key.");

        const config: Config = {
            endpoint: input.endpoint?.trim() || undefined,
            region: input.region?.trim() || "auto",
            bucket,
            publicUrl: input.publicUrl?.trim().replace(/\/+$/, "") || undefined,
            forcePathStyle: input.forcePathStyle !== false,
            accessKeyHint: hint(keys.accessKeyId),
        };
        if (config.endpoint) await assertPublicEndpoint(config.endpoint, "storage endpoint");
        await this.check(new S3StorageDriver({ ...config, ...keys }));

        const data = { type: IntegrationType.STORAGE, provider: "s3", label: bucket, config: config as object, encryptedSecret: encryptSecret(JSON.stringify(keys)), status: "CONNECTED" as const, lastCheckedAt: new Date(), createdById: user.id };
        if (existing) await this.prisma.integration.update({ where: { id: existing.id }, data });
        else await this.prisma.integration.create({ data: { workspaceId: user.workspaceId, ...data } });
        await this.refresh();
        this.audit.record({ workspaceId: user.workspaceId, action: "storage.update", resource: "Integration", title: bucket, metadata: { endpoint: config.endpoint ?? null, accessKeyHint: config.accessKeyHint } });
        return this.status();
    }

    async disconnect(user: AuthUser) {
        this.requireOwner(user);
        const existing = await this.row();
        if (existing) await this.prisma.integration.delete({ where: { id: existing.id } });
        await this.refresh();
        this.audit.record({ workspaceId: user.workspaceId, action: "storage.remove", resource: "Integration", title: existing?.label ?? null });
        return this.status();
    }

    /** Write, read back and delete a small object, so bad keys are refused before they're saved. */
    private async check(driver: S3StorageDriver) {
        const key = `.flowcms/storage-check-${randomUUID()}.txt`;
        try {
            await driver.put(key, Buffer.from("ok"), "text/plain");
            if ((await driver.read(key)).toString() !== "ok") throw new Error("read back the wrong bytes");
            await driver.delete(key);
        } catch (err) {
            // Only an error code goes back (AccessDenied, NoSuchBucket, ECONNREFUSED...),
            // never the driver's message: that can echo what the endpoint answered,
            // which turns this form into a probe of whatever host it points at.
            // Network failures arrive as an AggregateError with no message, only a code.
            const e = err as { name?: string; code?: string; errors?: { code?: string }[] };
            const code = [e.name, e.code, e.errors?.[0]?.code].find((c) => c && !["Error", "AggregateError", "TypeError"].includes(c) && /^[A-Za-z_][\w.]{0,63}$/.test(c));
            const reason = code ? `access denied or unreachable (${code})` : "could not reach the endpoint or access was denied";
            throw new BadRequestException(`Storage check failed: ${reason}. Nothing was saved.`);
        }
    }
}
