import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class GenerateDto {
    /** Which feature is calling (for usage attribution), e.g. "content.generate". */
    @IsString()
    feature!: string;

    @IsString()
    prompt!: string;

    @IsOptional()
    @IsString()
    system?: string;

    /** Override the provider (defaults to the workspace's connected provider). */
    @IsOptional()
    @IsString()
    provider?: string;

    /** Override the model (defaults to the provider's configured default). */
    @IsOptional()
    @IsString()
    model?: string;

    /** Content type (apiId) context, so the right knowledge files are injected. */
    @IsOptional()
    @IsString()
    contentTypeApiId?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(2)
    temperature?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(8000)
    maxTokens?: number;

    /** Optional image (base64, no `data:` prefix) for vision tasks like alt text. */
    @IsOptional()
    @IsString()
    imageBase64?: string;

    /** MIME type of the image (e.g. "image/jpeg"); used with imageBase64. */
    @IsOptional()
    @IsString()
    imageMimeType?: string;
}
