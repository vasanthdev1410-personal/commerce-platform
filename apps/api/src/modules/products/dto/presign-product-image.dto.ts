import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';
import {
  MAX_PRODUCT_IMAGE_SIZE,
  PRODUCT_IMAGE_TYPES,
  type ProductImageContentType,
} from '../../storage/image.constants';

export class PresignProductImageDto {
  @IsString()
  @IsIn(Object.keys(PRODUCT_IMAGE_TYPES))
  contentType!: ProductImageContentType;

  @IsInt()
  @Min(1)
  @Max(MAX_PRODUCT_IMAGE_SIZE)
  fileSize!: number;
}
