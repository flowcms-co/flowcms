import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { IntegrationType } from "@flowcms/db";
import { decryptSecret, encryptSecret } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_TEMPLATES, testEmailHtml } from "./email-templates";

export type EmailProvider = "smtp" | "resend" | "sendgrid";
export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; from: string };
/** Config for the HTTP-API providers (Resend, SendGrid): only a from address, key is encrypted. */
export type ApiEmailConfig = { from: string };
export type ConnectSmtpInput = { host: string; port?: number; secure?: boolean; user: string; password: string; from: string };
export type ConnectApiInput = { apiKey: string; from: string };
export type ConnectInput =
    | ({ provider: "smtp" } & ConnectSmtpInput)
    | ({ provider: "resend" | "sendgrid" } & ConnectApiInput);
export type SendResult = { sent: boolean; reason?: string; error?: string; messageId?: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";
const isApiProvider = (p: string | null | undefined): p is "resend" | "sendgrid" => p === "resend" || p === "sendgrid";

/** Parse a `"Name <email@x.com>"` (or bare `email@x.com`) from address into parts (SendGrid needs this shape). */
const parseAddress = (s: string): { email: string; name?: string } => {
    const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (m) return { email: m[2].trim(), name: m[1].trim() || undefined };
    return { email: s.trim() };
};

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

    /** Connection status without exposing the secret. */
    async status(workspaceId: string) {
        const i = await this.integration(workspaceId);
        if (!i) return { connected: false };
        if (isApiProvider(i.provider)) {
            const c = (i.config ?? {}) as Partial<ApiEmailConfig>;
            return { connected: true, provider: i.provider, from: c.from };
        }
        const c = (i.config ?? {}) as Partial<SmtpConfig>;
        return { connected: true, provider: "smtp" as const, host: c.host, port: c.port, secure: c.secure, user: c.user, from: c.from };
    }

    /** Save/update email credentials (secret encrypted at rest). Provider is SMTP, Resend or SendGrid. */
    async connect(workspaceId: string, input: ConnectInput) {
        const isApi = input.provider === "resend" || input.provider === "sendgrid";
        const provider: EmailProvider = isApi ? input.provider : "smtp";
        const existing = await this.integration(workspaceId);

        // A blank secret on an update keeps the stored one (same provider); otherwise it's required.
        const rawSecret = input.provider === "smtp" ? input.password : input.apiKey;
        const encryptedSecret = rawSecret
            ? encryptSecret(rawSecret)
            : existing?.provider === provider && existing.encryptedSecret
              ? existing.encryptedSecret
              : null;
        if (!encryptedSecret) {
            throw new BadRequestException(isApi ? "An API key is required." : "A password is required.");
        }

        const base = { type: IntegrationType.SMTP, status: "CONNECTED" as const, encryptedSecret };
        const data =
            input.provider === "smtp"
                ? {
                      ...base,
                      provider,
                      label: input.host,
                      config: {
                          host: input.host,
                          port: input.port ?? 587,
                          secure: input.secure ?? (input.port === 465),
                          user: input.user,
                          from: input.from,
                      } satisfies SmtpConfig as object,
                  }
                : { ...base, provider, label: input.provider === "sendgrid" ? "SendGrid" : "Resend", config: { from: input.from } satisfies ApiEmailConfig as object };

        if (existing) await this.prisma.integration.update({ where: { id: existing.id }, data });
        else await this.prisma.integration.create({ data: { workspaceId, ...data } });
        return this.status(workspaceId);
    }

    async disconnect(workspaceId: string) {
        const existing = await this.integration(workspaceId);
        if (existing) await this.prisma.integration.delete({ where: { id: existing.id } });
        return { connected: false };
    }

    private smtpTransport(config: SmtpConfig, secret: string): { tx: Transporter; from: string } {
        const tx = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: { user: config.user, pass: secret },
        });
        return { tx, from: config.from || config.user };
    }

    /** Send via the Resend HTTP API (no SMTP transport, no extra dependency). */
    private async sendViaResend(apiKey: string, from: string, msg: { to: string; subject: string; html: string; text?: string }): Promise<SendResult> {
        try {
            const res = await fetch(RESEND_ENDPOINT, {
                method: "POST",
                headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
                body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
            });
            const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
            if (!res.ok) return { sent: false, error: data.message || data.name || `Resend error ${res.status}` };
            return { sent: true, messageId: data.id };
        } catch (err) {
            this.logger.error(`Resend send failed → ${msg.to}`, err as Error);
            return { sent: false, error: (err as Error).message };
        }
    }

    /** Send via the SendGrid v3 HTTP API (202 + empty body on success; id in X-Message-Id). */
    private async sendViaSendgrid(apiKey: string, from: string, msg: { to: string; subject: string; html: string; text?: string }): Promise<SendResult> {
        try {
            const res = await fetch(SENDGRID_ENDPOINT, {
                method: "POST",
                headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email: msg.to }] }],
                    from: parseAddress(from),
                    subject: msg.subject,
                    // SendGrid requires text/plain before text/html when both are present.
                    content: [...(msg.text ? [{ type: "text/plain", value: msg.text }] : []), { type: "text/html", value: msg.html }],
                }),
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] };
                return { sent: false, error: data.errors?.[0]?.message || `SendGrid error ${res.status}` };
            }
            return { sent: true, messageId: res.headers.get("x-message-id") ?? undefined };
        } catch (err) {
            this.logger.error(`SendGrid send failed → ${msg.to}`, err as Error);
            return { sent: false, error: (err as Error).message };
        }
    }

    /** Low-level send. No-ops (logs) gracefully when no email provider is configured. */
    async send(workspaceId: string, msg: { to: string; subject: string; html: string; text?: string }): Promise<SendResult> {
        const i = await this.integration(workspaceId);
        if (!i || !i.encryptedSecret) {
            this.logger.warn(`Email skipped (no provider configured): "${msg.subject}" → ${msg.to}`);
            return { sent: false, reason: "email-not-configured" };
        }
        const secret = decryptSecret(i.encryptedSecret);

        if (isApiProvider(i.provider)) {
            const c = (i.config ?? {}) as ApiEmailConfig;
            return i.provider === "sendgrid" ? this.sendViaSendgrid(secret, c.from, msg) : this.sendViaResend(secret, c.from, msg);
        }

        try {
            const t = this.smtpTransport((i.config ?? {}) as SmtpConfig, secret);
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
            subject: "Flow CMS — email test",
            html: render(testEmailHtml(), all),
            text: "Your email connection works. This is a test email from Flow CMS.",
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
