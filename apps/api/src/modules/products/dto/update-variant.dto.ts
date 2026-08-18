import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  IsUUID,
} from 'class-validator';

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  retailPricePaise?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wholesalePricePaise?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  wholesaleMinQty?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsUUID() taxProfileId?: string;
  @IsOptional() @IsString() @MaxLength(30) hsnCode?: string;
}
