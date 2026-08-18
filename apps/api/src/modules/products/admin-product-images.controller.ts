import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ConfirmProductImageDto } from './dto/confirm-product-image.dto';
import { PresignProductImageDto } from './dto/presign-product-image.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { ProductImagesService } from './product-images.service';

@Controller('admin/products/:productId/images')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('ADMIN')
export class AdminProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Post('presign')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  presign(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: PresignProductImageDto,
  ) {
    return this.images.presign(productId, dto);
  }

  @Post()
  confirm(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ConfirmProductImageDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.images.confirm(productId, dto, admin.id);
  }

  @Get()
  list(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.images.list(productId);
  }

  @Patch(':imageId')
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: UpdateProductImageDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.images.update(productId, imageId, dto, admin.id);
  }

  @Delete(':imageId')
  remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.images.remove(productId, imageId, admin.id);
  }
}
