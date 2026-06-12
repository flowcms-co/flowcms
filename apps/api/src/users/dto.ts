import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class CreateUserDto {
    @IsEmail()
    email!: string;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    title?: string;

    @MinLength(8)
    password!: string;

    @IsString()
    roleKey!: string;
}

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    roleKey?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    /** Weekly content goal for this writer (null/0 = use the workspace default). */
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    weeklyGoal?: number | null;

    @IsOptional()
    @IsString()
    weeklyGoalTopic?: string | null;
}
