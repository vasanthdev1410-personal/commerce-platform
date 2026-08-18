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

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsObject()
  attributes!: Record<string, unknown>;

  @IsInt()
  @Min(0)
  retailPricePaise!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wholesalePricePaise?: number;

  @IsInt()
  @Min(1)
  wholesaleMinQty!: number;

  @IsInt()
  @Min(0)
  stockQuantity!: number;

  @IsInt()
  @Min(0)
  reorderLevel!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsUUID() taxProfileId?: string;
  @IsOptional() @IsString() @MaxLength(30) hsnCode?: string;
}
