import { ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { hashPassword } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AvatarsService } from "../avatars/avatars.service";
import { TelemetryService } from "../telemetry/telemetry.service";
import type { ClaimDto } from "./dto";

const DEFAULT_SLUG = "default";

@Injectable()
export class SetupService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auth: AuthService,
        private readonly avatars: AvatarsService,
        private readonly telemetry: TelemetryService,
    ) {}

    /** Has the instance been claimed yet? Claimed = a super_admin exists in the
     *  default workspace. Public — the studio uses this to decide whether to show
     *  the first-run wizard. Also returns the configured public hostname so the
     *  wizard can display it read-only (it is fixed at install / by the platform). */
    async status(): Promise<{ claimed: boolean; hostname: string | null }> {
        const claimed = await this.hasSuperAdmin();
        return { claimed, hostname: process.env.STUDIO_URL ?? null };
    }

    private async hasSuperAdmin(): Promise<boolean> {
        const count = await this.prisma.membership.count({
            where: { workspace: { slug: DEFAULT_SLUG }, role: { key: "super_admin" } },
        });
        return count > 0;
    }

    /** First-run claim: create the super admin + session. Succeeds only while the
     *  instance is unclaimed; a Serializable transaction makes the "no admin yet"
     *  check race-safe (two concurrent claims → one aborts), so it can't be replayed
     *  to mint a second super admin after the first. */
    async claim(dto: ClaimDto, meta?: { userAgent?: string; ip?: string }) {
        const email = dto.email.toLowerCase().trim();

        const userId = await this.prisma
            .$transaction(
                async (tx) => {
                    const ws = await tx.workspace.findUnique({ where: { slug: DEFAULT_SLUG } });
                    if (!ws) throw new InternalServerErrorException("Default workspace not found. The instance has not finished bootstrapping.");

                    const existingAdmins = await tx.membership.count({ where: { workspaceId: ws.id, role: { key: "super_admin" } } });
                    if (existingAdmins > 0) throw new ConflictException("This Flow CMS instance has already been set up. Sign in instead.");

                    if (await tx.user.findUnique({ where: { email } })) {
                        throw new ConflictException("An account with this email already exists.");
                    }

                    const role = await tx.role.findUnique({ where: { workspaceId_key: { workspaceId: ws.id, key: "super_admin" } } });
                    if (!role) throw new InternalServerErrorException("super_admin role missing. The instance has not finished bootstrapping.");

                    const avatar = this.avatars.profileFrom({ name: dto.name ?? null, email });
                    const user = await tx.user.create({
                        data: {
                            email,
                            name: dto.name?.trim() || "Administrator",
                            passwordHash: hashPassword(dto.password),
                            emailVerifiedAt: new Date(),
                            // Consent is validated as required on the DTO.
                            termsAcceptedAt: new Date(),
                            marketingOptInAt: new Date(),
                            ...avatar,
                            memberships: { create: { workspaceId: ws.id, roleId: role.id } },
                        },
                    });

                    // Optional rename of the default workspace (its onboarding state is
                    // left untouched so the user still lands on the /setup content wizard).
                    const name = dto.workspaceName?.trim();
                    if (name) await tx.workspace.update({ where: { id: ws.id }, data: { name } });

                    return user.id;
                },
                { isolationLevel: "Serializable" },
            )
            .catch((e) => {
                if (e instanceof ConflictException || e instanceof InternalServerErrorException) throw e;
                // A serialization conflict means a concurrent claim won the race.
                throw new ConflictException("This Flow CMS instance has already been set up. Sign in instead.");
            });

        const token = await this.auth.createSession(userId, meta);
        await this.auth.recordConsent(userId, "setup", { ip: meta?.ip, clientIp: dto.clientIp, userAgent: meta?.userAgent });
        // Tell the vendor right away (owner + consent ride the regular heartbeat
        // payload) instead of waiting up to 12h for the next scheduled beat.
        void this.telemetry.beat().catch(() => undefined);
        return { token, user: await this.auth.getAuthUser(userId) };
    }
}
