import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE, sessionCookieOptions } from "./constants";
import { CurrentUser, Public, RequirePermissions } from "./decorators";
import {
    ChangePasswordDto,
    DeleteAccountDto,
    ForgotPasswordDto,
    NotificationPrefsDto,
    ResetPasswordDto,
    SigninDto,
    
    TwoFactorCodeDto,
    UpdateAvatarDto,
    UpdateProfileDto,
} from "./dto";
import type { AuthUser } from "./types";
import { PERMISSIONS } from "@flowcms/shared";

@Controller("auth")
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    /** Update the signed-in user's illustrated avatar (style / presentation / color). */
    @Patch("avatar")
    async updateAvatar(@CurrentUser() user: AuthUser, @Body() dto: UpdateAvatarDto) {
        return { user: await this.auth.updateAvatar(user.id, dto) };
    }

    /** Update the signed-in user's name + title. */
    @Patch("profile")
    async updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
        return { user: await this.auth.updateProfile(user.id, dto) };
    }

    /** Change the signed-in user's password. */
    @HttpCode(200)
    @Patch("password")
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
        return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, req.ip);
    }

    /** Read / update the signed-in user's email-notification preferences. */
    @Get("notifications")
    getNotifications(@CurrentUser() user: AuthUser) {
        return this.auth.getNotificationPrefs(user.id);
    }

    @HttpCode(200)
    @Patch("notifications")
    setNotifications(@CurrentUser() user: AuthUser, @Body() dto: NotificationPrefsDto) {
        return this.auth.setNotificationPrefs(user.id, dto.prefs, dto.digestFrequency);
    }

    /** Permanently delete the signed-in user's own account (password-confirmed). */
    @HttpCode(200)
    @Delete("account")
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.auth.deleteAccount(user.id, dto.password);
        res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
        return result;
    }

    /** The workspace's consent evidence trail (admins): who accepted the terms
     *  and product emails, when, from which IPs and which browser/OS/device. */
    @Get("consent-records")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    consentRecords() {
        return this.auth.listConsentRecords();
    }

    /** Record Terms acceptance + email opt-in for the signed-in user. Shown as a
     *  one-time prompt to accounts that predate consent capture. */
    @Post("consent")
    async consent(@CurrentUser() me: AuthUser, @Body() body: { clientIp?: string }, @Req() req: Request) {
        const user = await this.auth.acceptConsent(me.id, {
            ip: req.ip,
            clientIp: typeof body?.clientIp === "string" ? body.clientIp : undefined,
            userAgent: req.headers["user-agent"],
        });
        return { user };
    }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(200)
    @Post("signin")
    async signin(@Body() dto: SigninDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const result = await this.auth.signin(dto, this.meta(req));
        // 2FA-enabled account, no code yet: tell the client to prompt for one (no session issued).
        if ("twoFactorRequired" in result) return { twoFactorRequired: true };
        res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions());
        return { user: result.user };
    }

    /** Begin 2FA enrolment — returns a QR + secret to add to an authenticator app. */
    @Post("2fa/setup")
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    setup2fa(@CurrentUser() user: AuthUser) {
        return this.auth.startTwoFactor(user.id);
    }

    /** Confirm a code to activate 2FA; returns one-time backup codes. */
    @HttpCode(200)
    @Post("2fa/enable")
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    enable2fa(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto, @Req() req: Request) {
        return this.auth.enableTwoFactor(user.id, dto.code, req.ip);
    }

    @HttpCode(200)
    @Post("2fa/disable")
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    disable2fa(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto, @Req() req: Request) {
        return this.auth.disableTwoFactor(user.id, dto.code, req.ip);
    }

    @HttpCode(200)
    @Post("2fa/backup-codes")
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    regenBackup(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
        return this.auth.regenerateBackupCodes(user.id, dto.code);
    }

    @HttpCode(200)
    @Post("signout")
    async signout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[
            SESSION_COOKIE
        ];
        if (token) await this.auth.signout(token);
        res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
        return { ok: true };
    }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(200)
    @Post("forgot-password")
    forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.auth.forgotPassword(dto.email);
    }

    @Public()
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(200)
    @Post("reset-password")
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.auth.resetPassword(dto.token, dto.password);
    }

    /** The session probe. Anonymous is a valid answer here — the studio calls
     *  this on every load (including the login screen) to decide auth state, so
     *  an unauthenticated request returns 200 `{ user: null }` rather than a 401
     *  that lands in the browser console as a failed request. */
    @Public()
    @Get("me")
    async me(@Req() req: Request) {
        const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
        const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
        const token = cookieToken ?? bearer;
        const user = token ? await this.auth.validate(token, req.ip) : null;
        return { user };
    }

    private meta(req: Request) {
        return {
            userAgent: req.headers["user-agent"],
            ip: req.ip,
        };
    }
}
