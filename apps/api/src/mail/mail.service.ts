import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { IntegrationType } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_TEMPLATES, testEmailHtml } from "./email-templates";

export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; from: string };
export type ConnectSmtpInput = { host: string; port?: number; secure?: boolean; user: string; password: string; from: string };
export type SendResult = { sent: boolean; reason?: string; error?: string; messageId?: string };

/** Built-in default templates (branded design system; see email-templates.ts). */
const DEFAULTS = DEFAULT_TEMPLATES;

const render = (tpl: string, vars: Record<string, string>) =>
    tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");

/** Absolute studio origin for email assets ({{studioUrl}}/email/…) and links. */
const studioUrl = () => (process.env.STUDIO_URL ?? "http://localhost:3000").replace(/\/+$/, "");

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    constructor(private readonly prisma: PrismaService) {}

    private integration(workspaceId: string) {
        return this.prisma.integration.findFirst({ where: { workspaceId, type: IntegrationType.SMTP } });
    }

    /** Connection status without exposing the password. */
    async status(workspaceId: string) {
        const i = await this.integration(workspaceId);
        if (!i) return { connected: false };
        const c = (i.config ?? {}) as Partial<SmtpConfig>;
        return { connected: true, host: c.host, port: c.port, secure: c.secure, user: c.user, from: c.from };
    }

    /** Save/update SMTP credentials (password encrypted at rest). */
    async connect(workspaceId: string, input: ConnectSmtpInput) {
        const config: SmtpConfig = {
            host: input.host,
            port: input.port ?? 587,
            secure: input.secure ?? (input.port === 465),
            user: input.user,
            from: input.from,
        };
        const existing = await this.integration(workspaceId);
        const data = {
            type: IntegrationType.SMTP,
            provider: "smtp",
            label: input.host,
            status: "CONNECTED" as const,
            config: config as object,
            encryptedSecret: encryptSecret(input.password),
        };
        if (existing) await this.prisma.integration.update({ where: { id: existing.id }, data });
        else await this.prisma.integration.create({ data: { workspaceId, ...data } });
        return this.status(workspaceId);
    }

    async disconnect(workspaceId: string) {
        const existing = await this.integration(workspaceId);
        if (existing) await this.prisma.integration.delete({ where: { id: existing.id } });
        return { connected: false };
    }

    private async transport(workspaceId: string): Promise<{ tx: Transporter; from: string } | null> {
        const i = await this.integration(workspaceId);
        if (!i || !i.encryptedSecret) return null;
        const c = (i.config ?? {}) as SmtpConfig;
        const tx = nodemailer.createTransport({
            host: c.host,
            port: c.port,
            secure: c.secure,
            auth: { user: c.user, pass: decryptSecret(i.encryptedSecret) },
        });
        return { tx, from: c.from || c.user };
    }

    /** Low-level send. No-ops (logs) gracefully when SMTP isn't configured. */
    async send(workspaceId: string, msg: { to: string; subject: string; html: string; text?: string }): Promise<SendResult> {
        const t = await this.transport(workspaceId);
        if (!t) {
            this.logger.warn(`Email skipped (SMTP not configured): "${msg.subject}" → ${msg.to}`);
            return { sent: false, reason: "smtp-not-configured" };
        }
        try {
            const info = await t.tx.sendMail({ from: t.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
            return { sent: true, messageId: info.messageId };
        } catch (err) {
            this.logger.error(`Email send failed → ${msg.to}`, err as Error);
            return { sent: false, error: (err as Error).message };
        }
    }

    /** Globals every template can rely on: asset base + workspace name. */
    private async globalVars(workspaceId: string): Promise<Record<string, string>> {
        const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
        return { studioUrl: studioUrl(), workspace: ws?.name ?? "Flow CMS" };
    }

    /** Render a stored template (or its built-in default) and send it. Best-effort. */
    async sendTemplate(workspaceId: string, key: string, to: string, vars: Record<string, string>): Promise<SendResult> {
        const stored = await this.prisma.emailTemplate.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
        const tpl = stored && stored.enabled ? stored : DEFAULTS[key];
        if (!tpl) return { sent: false, reason: "no-template" };
        const all = { ...(await this.globalVars(workspaceId)), ...vars };
        return this.send(workspaceId, {
            to,
            subject: render(tpl.subject, all),
            html: render(tpl.html, all),
            text: stored?.text ? render(stored.text, all) : undefined,
        });
    }

    async sendTest(workspaceId: string, to: string): Promise<SendResult> {
        const all = await this.globalVars(workspaceId);
        return this.send(workspaceId, {
            to,
            subject: "Flow CMS — SMTP test",
            html: render(testEmailHtml(), all),
            text: "Your SMTP connection works. This is a test email from Flow CMS.",
        });
    }

    /** Template management — merges built-in defaults with any stored overrides. */
    async listTemplates(workspaceId: string) {
        const stored = await this.prisma.emailTemplate.findMany({ where: { workspaceId } });
        const byKey = new Map(stored.map((t) => [t.key, t]));
        return Object.entries(DEFAULTS).map(([key, d]) => {
            const s = byKey.get(key);
            return {
                key,
                name: s?.name ?? d.name,
                subject: s?.subject ?? d.subject,
                html: s?.html ?? d.html,
                enabled: s?.enabled ?? true,
                customized: !!s,
            };
        });
    }

    /** Drop a workspace override so the template falls back to the built-in default. */
    async resetTemplate(workspaceId: string, key: string) {
        await this.prisma.emailTemplate.deleteMany({ where: { workspaceId, key } });
        return { ok: true };
    }

    async updateTemplate(workspaceId: string, key: string, dto: { name?: string; subject?: string; html?: string; enabled?: boolean }) {
        const d = DEFAULTS[key];
        if (!d) return { ok: false };
        await this.prisma.emailTemplate.upsert({
            where: { workspaceId_key: { workspaceId, key } },
            update: { ...dto },
            create: {
                workspaceId,
                key,
                name: dto.name ?? d.name,
                subject: dto.subject ?? d.subject,
                html: dto.html ?? d.html,
                enabled: dto.enabled ?? true,
            },
        });
        return { ok: true };
    }
}
