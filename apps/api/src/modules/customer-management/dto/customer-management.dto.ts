import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { AccountType, WholesaleApplicationStatus, WholesaleStatus } from '../../../generated/prisma/client';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const booleanValue = ({ value }: { value: unknown }): unknown => value === 'true' ? true : value === 'false' ? false : value;

export class UpdateProfileDto {
  @Transform(trim) @IsOptional() @IsString() @Length(1, 100) firstName?: string;
  @Transform(trim) @IsOptional() @IsString() @Length(1, 100) lastName?: string;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^\+?[0-9][0-9 -]{6,19}$/) phone?: string;
}

export class CreateAddressDto {
  @Transform(trim) @IsString() @Length(1, 100) label!: string;
  @Transform(trim) @IsString() @Length(1, 150) fullName!: string;
  @Transform(trim) @IsString() @Matches(/^\+?[0-9][0-9 -]{6,19}$/) phone!: string;
  @Transform(trim) @IsString() @Length(1, 250) addressLine1!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(250) addressLine2?: string;
  @Transform(trim) @IsString() @Length(1, 100) city!: string;
  @Transform(trim) @IsString() @Length(1, 100) state!: string;
  @Transform(trim) @IsString() @Length(3, 20) postalCode!: string;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/) countryCode = 'IN';
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(30) locationProvider?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(200) providerPlaceId?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(500) formattedAddress?: string;
}

export class UpdateAddressDto {
  @Transform(trim) @IsOptional() @IsString() @Length(1, 100) label?: string;
  @Transform(trim) @IsOptional() @IsString() @Length(1, 150) fullName?: string;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^\+?[0-9][0-9 -]{6,19}$/) phone?: string;
  @Transform(trim) @IsOptional() @IsString() @Length(1, 250) addressLine1?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(250) addressLine2?: string;
  @Transform(trim) @IsOptional() @IsString() @Length(1, 100) city?: string;
  @Transform(trim) @IsOptional() @IsString() @Length(1, 100) state?: string;
  @Transform(trim) @IsOptional() @IsString() @Length(3, 20) postalCode?: string;
  @Transform(trim) @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(30) locationProvider?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(200) providerPlaceId?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(500) formattedAddress?: string;
}

export class WholesaleApplicationDto {
  @Transform(trim) @IsString() @Length(2, 200) businessName!: string;
  @Transform(trim) @IsString() @Length(2, 100) businessType!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(20) gstin?: string;
  @Transform(trim) @IsString() @Length(5, 500) businessAddress!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class PageQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class CustomerQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(AccountType) accountType?: AccountType;
  @IsOptional() @IsEnum(WholesaleStatus) wholesaleStatus?: WholesaleStatus;
  @Transform(booleanValue) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ApplicationQueryDto extends PageQueryDto {
  @IsOptional() @IsEnum(WholesaleApplicationStatus) status?: WholesaleApplicationStatus;
}

export class CustomerStatusDto { @IsBoolean() isActive!: boolean; }
export class RejectApplicationDto { @Transform(trim) @IsOptional() @IsString() @MaxLength(500) reason?: string; }
