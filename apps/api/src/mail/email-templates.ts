/**
 * Default transactional email templates, in the FlowCMS email design system
 * (ported from flowcms-admin/lib/email/layout.ts): lavender body, the flowcms
 * lockup, an illustration hero panel, a bold ink headline, generous
 * whitespace, one purple CTA, real light + dark support, mobile-fluid.
 *
 * Templates are stored/edited as plain HTML with {{token}} placeholders, so
 * everything dynamic — including the asset base — is a token:
 *   {{studioUrl}}  absolute studio origin (injected on every send)
 *   {{workspace}}  workspace name (injected on every send)
 * plus the per-template tokens ({{name}}, {{link}}, {{title}}, …).
 *
 * Illustrations are served from the studio at {{studioUrl}}/email/ill-<key>.png
 * (placeholders ship with the studio; workspaces can drop in their own art).
 * Base styles are inline so the design survives clients that strip <style>;
 * the <style> block layers dark mode, mobile and the CTA glow on top.
 */

const INK = "#1a1a2e";
const BODY = "#46465f";
const GREY = "#73738f";
const BORDER = "#ece9f6";
const PURPLE = "#6c5ce7";

const FONT = "'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The Flow CMS lockup, email-safe: purple icon mark + "flowcms" wordmark. */
const brandLockup = (): string =>
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>` +
    `<td valign="middle" style="padding-right:10px;"><img src="{{studioUrl}}/email/icon.png" width="32" height="32" alt="Flow CMS" style="display:block;width:32px;height:32px;"></td>` +
    `<td valign="middle" style="font-family:${FONT};font-size:23px;font-weight:800;letter-spacing:-.02em;line-height:1;white-space:nowrap;"><span class="txt" style="color:${INK};">flow</span><span style="color:${PURPLE};">cms</span></td>` +
    `</tr></table>`;

/* ── Body content blocks. Inline = light default; classes flip in dark. ────── */
const text = (t: string) => `<p class="body-txt" style="margin:0 0 16px;font-size:15.5px;line-height:1.62;color:${BODY};">${t}</p>`;
const muted = (t: string) => `<p class="muted-txt" style="margin:0 0 16px;font-size:13px;line-height:1.55;color:${GREY};">${t}</p>`;
const button = (label: string, href: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;"><tr><td class="cta" style="border-radius:13px;background:${PURPLE};box-shadow:0 10px 24px rgba(108,92,231,.34);">` +
    `<a href="${href}" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${label} &rarr;</a></td></tr></table>`;
const panel = (inner: string) =>
    `<div class="panel" style="margin:2px 0 20px;background:#f8f7fe;border:1px solid ${BORDER};border-radius:14px;padding:16px 18px;">${inner}</div>`;

const layout = (opts: { preheader: string; illustration: string; headline: string; content: string }): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Flow CMS</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&display=swap');
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body,table,td { margin:0; padding:0; }
  a { text-decoration:none; }
  img { border:0; line-height:100%; outline:none; }
  @media (prefers-reduced-motion: no-preference) {
    .cta { animation: glow 2.6s ease-in-out infinite; }
    @keyframes glow { 0%,100%{ box-shadow:0 10px 24px rgba(108,92,231,.34); } 50%{ box-shadow:0 12px 32px rgba(108,92,231,.55); } }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background:#0e0e16 !important; }
    .card { background:#171723 !important; box-shadow:0 18px 50px rgba(0,0,0,.5) !important; border-color:#262638 !important; }
    .txt { color:#f4f3fb !important; }
    .body-txt { color:#c6c6db !important; }
    .muted-txt { color:#8f8fac !important; }
    .panel { background:#20202f !important; border-color:#2e2e44 !important; }
    .foot { color:#8e8eaa !important; }
    .foot a { color:#a29bfe !important; }
  }
  @media only screen and (max-width:600px) {
    .wrap { width:100% !important; }
    .card { border-radius:20px !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .ill-pad { padding:14px 14px 0 !important; }
    .h1 { font-size:25px !important; }
  }
</style>
</head>
<body class="bg" style="background:#f4f2fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;">${opts.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#f4f2fb;">
<tr><td align="center" style="padding:34px 14px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="wrap" style="width:600px;max-width:600px;">

  <!-- Logo -->
  <tr><td align="center" style="padding:2px 0 26px;">${brandLockup()}</td></tr>

  <!-- Card -->
  <tr><td class="card" style="background:#ffffff;border:1px solid #efedf8;border-radius:24px;box-shadow:0 18px 50px rgba(108,92,231,.13);overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td class="ill-pad" style="padding:16px 16px 0;">
        <img src="{{studioUrl}}/email/${opts.illustration}" width="100%" alt="" style="display:block;width:100%;height:auto;border-radius:16px;">
      </td></tr>
      <tr><td class="px" style="padding:28px 40px 6px;">
        <h1 class="h1 txt" style="margin:0 0 14px;font-family:${FONT};font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-.03em;color:${INK};">${opts.headline}</h1>
        ${opts.content}
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:26px 30px 8px;">
    <p class="foot" style="margin:0 0 6px;text-align:center;color:${GREY};font-size:12px;line-height:18px;">{{workspace}} runs on Flow CMS, the content platform for modern teams.</p>
    <p class="foot" style="margin:0;text-align:center;color:${GREY};font-size:12px;line-height:18px;">
      <a href="{{studioUrl}}/settings" style="color:${GREY};text-decoration:underline;">Manage preferences</a> &nbsp;&middot;&nbsp; <a href="{{studioUrl}}" style="color:${GREY};text-decoration:underline;">Open the studio</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

/** Built-in default templates (used until a workspace customizes them). */
export const DEFAULT_TEMPLATES: Record<string, { name: string; subject: string; html: string }> = {
    welcome: {
        name: "Welcome",
        subject: "Welcome to {{workspace}}",
        html: layout({
            preheader: "Your account is ready — come on in.",
            illustration: "ill-welcome.jpg",
            headline: "Welcome aboard, {{name}} 👋",
            content:
                text("Your account on <b>{{workspace}}</b> is ready. Your dashboard, the block editor and your team are waiting.") +
                button("Open the studio", "{{studioUrl}}") +
                muted("Tip: the guided tour in the top bar walks you through every screen."),
        }),
    },
    invite: {
        name: "Team invite",
        subject: "You've been invited to {{workspace}}",
        html: layout({
            preheader: "{{inviter}} invited you to join {{workspace}}.",
            illustration: "ill-invite.jpg",
            headline: "You're invited 🎉",
            content:
                text("<b>{{inviter}}</b> invited you to join <b>{{workspace}}</b> on Flow CMS as <b>{{role}}</b>.") +
                button("Accept the invite", "{{link}}") +
                muted("If you weren't expecting this invite, you can safely ignore this email."),
        }),
    },
    reset_password: {
        name: "Password reset",
        subject: "Reset your {{workspace}} password",
        html: layout({
            preheader: "Here's your password reset link. It expires in 1 hour.",
            illustration: "ill-reset_password.jpg",
            headline: "Let's get you back in",
            content:
                text("Hi {{name}}, we received a request to reset your <b>{{workspace}}</b> password. This link expires in <b>1 hour</b>.") +
                button("Reset password", "{{link}}") +
                muted("If you didn't request this, you can ignore this email — your password stays unchanged."),
        }),
    },
    content_published: {
        name: "Content published",
        subject: "“{{title}}” is now live",
        html: layout({
            preheader: "Your content just went live.",
            illustration: "ill-content_published.jpg",
            headline: "It's live! 🚀",
            content:
                text("Hi {{name}}, your content just went out into the world on <b>{{workspace}}</b>:") +
                panel(`<div class="txt" style="font-size:16px;font-weight:700;color:${INK};line-height:1.4;">{{title}}</div>`) +
                button("View it live", "{{link}}"),
        }),
    },
    alert: {
        name: "Notification",
        subject: "{{title}}",
        html: layout({
            preheader: "{{title}}",
            illustration: "ill-alert.jpg",
            headline: "{{title}}",
            content: text("Hi {{name}},") + text("{{body}}") + button("Open Flow CMS", "{{link}}"),
        }),
    },
    digest: {
        name: "Activity digest",
        subject: "{{count}} update{{plural}} on {{workspace}}",
        html: layout({
            preheader: "Here's what happened on {{workspace}} since your last digest.",
            illustration: "ill-digest.jpg",
            headline: "{{count}} update{{plural}} for you",
            content:
                text("Hi {{name}}, here's what happened on <b>{{workspace}}</b> since your last digest:") +
                panel(`<div class="body-txt" style="font-size:14px;line-height:1.7;color:${BODY};">{{items}}</div>`) +
                button("Open notifications", "{{link}}"),
        }),
    },
};

/** The SMTP test email, in the same design (so a test also previews the look). */
export const testEmailHtml = (): string =>
    layout({
        preheader: "Your SMTP connection works.",
        illustration: "ill-welcome.jpg",
        headline: "Your SMTP works ✅",
        content:
            text("This is a test email from <b>{{workspace}}</b>. Delivery, styling and images all made it through, so invites, resets and alerts are good to go.") +
            button("Open email settings", "{{studioUrl}}/settings/integrations?tab=email"),
    });
