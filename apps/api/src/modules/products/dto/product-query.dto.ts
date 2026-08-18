import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const PRODUCT_SORTS = [
  'newest',
  'price_low',
  'price_high',
  'name_asc',
  'name_desc',
] as const;

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  category?: string;

  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: (typeof PRODUCT_SORTS)[number] = 'newest';
}
