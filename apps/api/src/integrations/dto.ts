import { IsOptional, IsString } from "class-validator";

export class ConnectIntegrationDto {
    @IsString()
    provider!: string;

    @IsOptional()
    @IsString()
    apiKey?: string;

    @IsOptional()
    @IsString()
    label?: string;

    @IsOptional()
    @IsString()
    baseUrl?: string;

    @IsOptional()
    @IsString()
    defaultModel?: string;
}
