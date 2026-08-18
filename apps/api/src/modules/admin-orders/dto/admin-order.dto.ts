import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { OrderStatus, PaymentStatus, PricingMode } from '../../../generated/prisma/client';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class AdminPageDto{@Type(()=>Number)@IsInt()@Min(1)page=1;@Type(()=>Number)@IsInt()@Min(1)@Max(100)limit=20;@Transform(trim)@IsOptional()@IsString()@MaxLength(100)search?:string;@IsOptional()@IsDateString()dateFrom?:string;@IsOptional()@IsDateString()dateTo?:string;}
export class AdminOrderQueryDto extends AdminPageDto{@IsOptional()@IsEnum(OrderStatus)status?:OrderStatus;@IsOptional()@IsEnum(PricingMode)pricingMode?:PricingMode;@IsOptional()@IsEnum(PaymentStatus)paymentStatus?:PaymentStatus;}
export class AdminPaymentQueryDto extends AdminPageDto{@IsOptional()@IsEnum(PaymentStatus)status?:PaymentStatus;@Transform(trim)@IsOptional()@IsString()@MaxLength(50)provider?:string;@Transform(trim)@IsOptional()@IsString()@MaxLength(100)orderNumber?:string;}
export class UpdateOrderStatusDto{@IsEnum(OrderStatus)status!:OrderStatus;}
export class RefundPaymentDto{@Type(()=>Number)@IsInt()@Min(1)amountPaise!:number;@Transform(trim)@IsOptional()@IsString()@Length(1,500)reason?:string;}
