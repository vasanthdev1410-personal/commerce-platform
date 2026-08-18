import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ConfirmProductImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;

  @IsInt()
  @Min(0)
  position!: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
