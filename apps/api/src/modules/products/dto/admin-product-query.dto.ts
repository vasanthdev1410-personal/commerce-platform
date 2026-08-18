import { IsIn, IsOptional, IsString } from 'class-validator';
import { ProductQueryDto } from './product-query.dto';

export class AdminProductQueryDto extends ProductQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive', 'deleted'])
  status?: 'active' | 'inactive' | 'deleted';
}
