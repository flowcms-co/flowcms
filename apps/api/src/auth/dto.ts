import { IsEmail, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateProfileDto {
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsString() title?: string;
}

export class ChangePasswordDto {
    @IsString() currentPassword!: string;
    @MinLength(12, { message: "New password must be at least 12 characters." })
    newPassword!: string;
}

export class NotificationPrefsDto {
    @IsObject() prefs!: Record<string, boolean>;
    @IsOptional() @IsIn(["off", "daily", "weekly"]) digestFrequency?: string;
}

export class DeleteAccountDto {
    @IsString() password!: string;
}

export class SignupDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsEmail()
    email!: string;

    @MinLength(12, { message: "Password must be at least 12 characters." })
    password!: string;

    // Avatar "vibe" answers (optional — a default avatar is created either way).
    @IsOptional() @IsString() avatarStyle?: string;
    @IsOptional() @IsString() gender?: string;
    @IsOptional() @IsString() avatarBg?: string;
}

export class UpdateAvatarDto {
    @IsOptional() @IsString() avatarStyle?: string;
    @IsOptional() @IsString() gender?: string;
    @IsOptional() @IsString() avatarBg?: string;
}

export class SigninDto {
    @IsEmail()
    email!: string;

    @IsString()
    password!: string;

    // TOTP or backup code, required only when the account has 2FA enabled.
    @IsOptional() @IsString() code?: string;
}

export class TwoFactorCodeDto {
    @IsString() code!: string;
}

export class ForgotPasswordDto {
    @IsEmail()
    email!: string;
}

export class ResetPasswordDto {
    @IsString()
    token!: string;

    @MinLength(12, { message: "Password must be at least 12 characters." })
    password!: string;
}
