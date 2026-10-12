import { Type, Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import type { ClaimBasis, SourceReference } from '@outsaid/contracts';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class SourceDto implements SourceReference {
  @IsIn(['DOCUMENT', 'LINK', 'EYEWITNESS']) kind!: SourceReference['kind'];
  @Transform(trim) @IsString() @Length(5, 200) label!: string;
  // URLs are required for documents/links, optional for eyewitness references.
  @ValidateIf((source: SourceDto) => source.kind !== 'EYEWITNESS' || source.url != null)
  @IsString() @MaxLength(2048)
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: true, disallow_auth: true })
  url?: string | null;
  @Transform(trim)
  @ValidateIf((source: SourceDto) => source.kind === 'EYEWITNESS' || source.notes != null)
  @IsString() @Length(20, 1000) notes?: string | null;
}
export class CreateReportDto {
  @Transform(trim) @IsString() @Length(5, 200) headline!: string;
  @Transform(trim) @IsString() @Length(20, 20000) body!: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 120) locality?: string | null;
  @IsIn(['ALLEGATION', 'EYEWITNESS_ACCOUNT', 'DOCUMENTED_INFORMATION']) claimBasis!: ClaimBasis;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SourceDto)
  sources!: SourceDto[];
}
export class EditReportDto extends CreateReportDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @Transform(trim) @IsString() @Length(5, 500) changeSummary!: string;
}
export class SubmitReportDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
}
export class MineQueryDto {
  @IsOptional() @IsString() @Matches(/^[1-9][0-9]{0,2}$/) limit?: string;
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[A-Za-z0-9_-]+$/) cursor?: string;
}
