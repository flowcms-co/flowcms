import { IsArray, IsOptional, IsString } from "class-validator";

export class UpsertTemplateDto {
    @IsString() name!: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsString() icon?: string;
    @IsOptional() @IsString() color?: string;
    @IsString() typeApiId!: string;
    @IsOptional() @IsString() typeName?: string;
    @IsOptional() @IsString() jsonLd?: string;
    @IsOptional() @IsArray() fields?: { id: string; name: string; type: string; required?: boolean }[];
    @IsOptional() @IsString() body?: string;
}
