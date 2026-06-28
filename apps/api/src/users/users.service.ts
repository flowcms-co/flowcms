import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { hashPassword } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LicenseService } from "../license/license.service";
import { CreateUserDto, UpdateUserDto } from "./dto";

const STUDIO = process.env.STUDIO_URL ?? "http://localhost:3000";

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly notifications: NotificationsService,
        private readonly license: LicenseService,
    ) {}

    /**
     * Seat gate. Pro is hard-capped in-app (3 included + purchased seats); the studio offers to
     * buy a seat and retry. Community has no seat limit; Enterprise is contracted, so it's never
     * blocked here (the vendor is alerted on overage instead). Invited-but-unaccepted users
     * already exist as rows, so they count toward seats.
     */
    private async assertSeatAvailable() {
        const info = await this.license.info();
        if (info.plan !== "pro" || info.seats == null) return;
        const used = await this.prisma.user.count();
        if (used >= info.seats) {
            throw new ForbiddenException({ message: `You've used all ${info.seats} seats. Add a seat to invite more people.`, code: "seat_limit", seats: info.seats, used });
        }
    }

    async list(workspaceId: string) {
        const memberships = await this.prisma.membership.findMany({
            where: { workspaceId },
            include: { user: true, role: true },
            orderBy: { createdAt: "asc" },
        });
        return memberships.map((m) => ({
            id: m.user.id,
            email: m.user.email,
            name: m.user.name,
            title: m.user.title,
            avatarUrl: m.user.avatarUrl,
            avatarStyle: m.user.avatarStyle,
            isActive: m.user.isActive,
            createdAt: m.user.createdAt,
            role: { id: m.role.id, key: m.role.key, name: m.role.name },
            weeklyGoal: m.weeklyGoal,
            weeklyGoalTopic: m.weeklyGoalTopic,
        }));
    }

    private async roleByKey(workspaceId: string, key: string) {
        const role = await this.prisma.role.findUnique({
            where: { workspaceId_key: { workspaceId, key } },
        });
        if (!role) throw new BadRequestException(`Unknown role: ${key}`);
        return role;
    }

    async create(workspaceId: string, dto: CreateUserDto, inviterId?: string) {
        const email = dto.email.toLowerCase().trim();
        if (await this.prisma.user.findUnique({ where: { email } })) {
            throw new ConflictException("An account with this email already exists.");
        }
        await this.assertSeatAvailable();
        const role = await this.roleByKey(workspaceId, dto.roleKey);
        const user = await this.prisma.user.create({
            data: {
                email,
                name: dto.name ?? null,
                title: dto.title ?? null,
                passwordHash: hashPassword(dto.password),
                emailVerifiedAt: new Date(),
                memberships: { create: { workspaceId, roleId: role.id } },
            },
        });
        // Best-effort invite email (no-op until SMTP is connected).
        void (async () => {
            const [ws, inviter] = await Promise.all([
                this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
                inviterId ? this.prisma.user.findUnique({ where: { id: inviterId }, select: { name: true, email: true } }) : null,
            ]);
            await this.mail.sendTemplate(workspaceId, "invite", email, {
                name: dto.name ?? "there",
                workspace: ws?.name ?? "Flow CMS",
                inviter: inviter?.name ?? inviter?.email ?? "An admin",
                role: role.name,
                link: `${STUDIO}/login`,
            });
        })().catch(() => {});
        return { id: user.id, email: user.email };
    }

    async update(workspaceId: string, actingUserId: string, userId: string, dto: UpdateUserDto) {
        const membership = await this.prisma.membership.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            include: { role: true },
        });
        if (!membership) throw new NotFoundException("User not found in this workspace.");

        // Don't let the last super admin be demoted or deactivated out of existence.
        if (membership.role.key === "super_admin" && (dto.roleKey || dto.isActive === false)) {
            const superAdmins = await this.prisma.membership.count({
                where: { workspaceId, role: { key: "super_admin" } },
            });
            if (superAdmins <= 1) {
                throw new BadRequestException("Cannot change the only Super Admin.");
            }
        }

        const data: Record<string, unknown> = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.isActive !== undefined) data.isActive = dto.isActive;
        if (Object.keys(data).length) {
            await this.prisma.user.update({ where: { id: userId }, data });
        }
        const membershipData: Record<string, unknown> = {};
        if (dto.roleKey) membershipData.roleId = (await this.roleByKey(workspaceId, dto.roleKey)).id;
        if (dto.weeklyGoal !== undefined) membershipData.weeklyGoal = dto.weeklyGoal === null || dto.weeklyGoal === 0 ? null : dto.weeklyGoal;
        if (dto.weeklyGoalTopic !== undefined) membershipData.weeklyGoalTopic = dto.weeklyGoalTopic?.trim() || null;
        if (Object.keys(membershipData).length) {
            await this.prisma.membership.update({
                where: { userId_workspaceId: { userId, workspaceId } },
                data: membershipData,
            });
        }

        // Tell the writer when an admin assigns/changes their weekly goal (in-app
        // notification + best-effort email; the dashboard card shows it too).
        const goalChanged = dto.weeklyGoal !== undefined || dto.weeklyGoalTopic !== undefined;
        if (goalChanged && userId !== actingUserId) {
            const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { defaultWeeklyGoal: true } });
            const target = (membershipData.weeklyGoal as number | null | undefined) ?? ws?.defaultWeeklyGoal ?? 3;
            const topic = (membershipData.weeklyGoalTopic as string | null | undefined) ?? null;
            void this.notifications
                .create(workspaceId, userId, {
                    type: "goal",
                    title: `New weekly goal: ${target} ${target === 1 ? "piece" : "pieces"}`,
                    body: topic ? `Focus on ${topic}. Published or scheduled this week counts toward it.` : "Published or scheduled this week counts toward it.",
                    href: "/",
                })
                .catch(() => undefined);
        }
        return { ok: true };
    }

    async remove(workspaceId: string, actingUserId: string, userId: string) {
        if (userId === actingUserId) {
            throw new BadRequestException("You can't remove your own account.");
        }
        const membership = await this.prisma.membership.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            include: { role: true },
        });
        if (!membership) throw new NotFoundException("User not found in this workspace.");
        if (membership.role.key === "super_admin") {
            const superAdmins = await this.prisma.membership.count({
                where: { workspaceId, role: { key: "super_admin" } },
            });
            if (superAdmins <= 1) throw new BadRequestException("Cannot remove the only Super Admin.");
        }
        // Remove only this workspace membership — never hard-delete the global User
        // (that cascades Sessions + nulls AuditLog.userId, erasing the audit trail;
        // SECURITY_AUDIT_REPORT F-04). The user keeps any other workspaces; access
        // here is revoked because every request re-validates the membership, and a
        // now-missing activeWorkspaceId safely falls back (or 401s).
        await this.prisma.membership.delete({ where: { userId_workspaceId: { userId, workspaceId } } });
        // If that was their last membership, deactivate the orphaned account so it
        // can't be used, while preserving the row for audit history.
        const remaining = await this.prisma.membership.count({ where: { userId } });
        if (remaining === 0) {
            await this.prisma.session.deleteMany({ where: { userId } });
            await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
        }
        return { ok: true };
    }
}
