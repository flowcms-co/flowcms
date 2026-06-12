import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** First-run admin claim. Submitted once, while the instance is unclaimed. */
export class ClaimDto {
    @IsEmail()
    email!: string;

    // 12-char minimum for the very first (super admin) account — stricter than the
    // legacy 8-char floor used elsewhere (SECURITY_AUDIT_REPORT F-11).
    @MinLength(12, { message: "Password must be at least 12 characters." })
    password!: string;

    @IsOptional() @IsString() @MaxLength(120) name?: string;

    // Optional friendly workspace name; defaults to the bootstrap value if omitted.
    @IsOptional() @IsString() @MaxLength(120) workspaceName?: string;
}
