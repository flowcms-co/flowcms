import { Equals, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** First-run admin claim. Submitted once, while the instance is unclaimed. */
export class ClaimDto {
    @IsEmail()
    email!: string;

    // 12-char minimum for the very first (super admin) account — stricter than the
    // legacy 8-char floor used elsewhere (SECURITY_AUDIT_REPORT F-11).
    @MinLength(12, { message: "Password must be at least 12 characters." })
    password!: string;

    // Required: the admin's display name. Shown in the app and used to personalize the
    // vendor's install-welcome email.
    @IsString() @MinLength(1, { message: "Your name is required." }) @MaxLength(120) name!: string;

    // Required: friendly workspace name. Renames the default workspace and is reported in
    // telemetry so the vendor can send a personalized welcome.
    @IsString() @MinLength(1, { message: "Workspace name is required." }) @MaxLength(120) workspaceName!: string;

    // Consent capture — both are required to complete setup. Terms acceptance
    // covers the ToS + essential service and security emails; the second is the
    // product/marketing email opt-in.
    @Equals(true, { message: "Please accept the Terms of Service to continue." })
    acceptTerms!: boolean;

    @Equals(true, { message: "Please agree to receive product emails to continue." })
    acceptMarketing!: boolean;

    // Public IP the browser observed for itself (free lookup) — consent evidence.
    @IsOptional() @IsString() clientIp?: string;
}
