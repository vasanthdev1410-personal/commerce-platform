import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ReviewStatus } from '../../../generated/prisma/client';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class CreateReviewDto{@IsUUID()productId!:string;@Type(()=>Number)@IsInt()@Min(1)@Max(5)rating!:number;@Transform(trim)@IsOptional()@IsString()@Length(1,150)title?:string;@Transform(trim)@IsOptional()@IsString()@Length(1,5000)body?:string;}
export class UpdateReviewDto{@Type(()=>Number)@IsOptional()@IsInt()@Min(1)@Max(5)rating?:number;@Transform(trim)@IsOptional()@IsString()@Length(1,150)title?:string;@Transform(trim)@IsOptional()@IsString()@Length(1,5000)body?:string;}
export class ReviewQueryDto{@Type(()=>Number)@IsInt()@Min(1)page=1;@Type(()=>Number)@IsInt()@Min(1)@Max(100)limit=20;@Type(()=>Number)@IsOptional()@IsInt()@Min(1)@Max(5)rating?:number;@IsOptional()@IsBoolean()verifiedPurchase?:boolean;@IsOptional()@IsIn(['newest','oldest','highest-rating','lowest-rating'])sort='newest';}
export class AdminReviewQueryDto extends ReviewQueryDto{@IsOptional()@IsEnum(ReviewStatus)status?:ReviewStatus;}
export class RejectReviewDto{@Transform(trim)@IsString()@Length(1,500)reason!:string;}
export class ReviewUploadDto{@IsIn(['image/jpeg','image/png','image/webp'])contentType!:'image/jpeg'|'image/png'|'image/webp';@Type(()=>Number)@IsInt()@Min(1)@Max(8*1024*1024)fileSize!:number;}
export class ConfirmReviewMediaDto{@IsString()@Length(1,100)fileId!:string;@Type(()=>Number)@IsOptional()@IsInt()@Min(0)@Max(4)sortOrder=0;@Type(()=>Number)@IsOptional()@IsInt()@Min(1)width?:number;@Type(()=>Number)@IsOptional()@IsInt()@Min(1)height?:number;}
