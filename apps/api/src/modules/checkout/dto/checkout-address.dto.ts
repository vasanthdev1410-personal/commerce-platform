import { Type } from 'class-transformer';
import { IsISO31661Alpha2, IsLatitude, IsLongitude, IsOptional, IsPhoneNumber, IsPostalCode, IsString, IsUUID, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
export class ShippingAddressDto {
  @IsString() @MinLength(2) @MaxLength(100) fullName!:string;
  @IsPhoneNumber('IN') phone!:string;
  @IsString() @MinLength(3) @MaxLength(200) addressLine1!:string;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?:string;
  @IsString() @MinLength(2) @MaxLength(100) city!:string;
  @IsString() @MinLength(2) @MaxLength(100) state!:string;
  @IsPostalCode('IN') postalCode!:string;
  @IsISO31661Alpha2() countryCode:string='IN';
  @IsOptional() @IsLatitude() latitude?:number;
  @IsOptional() @IsLongitude() longitude?:number;
  @IsOptional() @IsString() @MaxLength(30) locationProvider?:string;
  @IsOptional() @IsString() @MaxLength(200) providerPlaceId?:string;
  @IsOptional() @IsString() @MaxLength(500) formattedAddress?:string;
}
export class CheckoutAddressDto {
  @ValidateIf((value:CheckoutAddressDto)=>!value.shippingAddress) @IsUUID() addressId?:string;
  @ValidateIf((value:CheckoutAddressDto)=>!value.addressId) @ValidateNested() @Type(()=>ShippingAddressDto) shippingAddress?:ShippingAddressDto;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) couponCode?:string;
}
