import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminProductQueryDto } from './dto/admin-product-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductsService } from './products.service';

@Controller('admin')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('ADMIN')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  list(@Query() query: AdminProductQueryDto) {
    return this.products.listAdmin(query);
  }

  @Get('products/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.getAdmin(id);
  }

  @Post('products')
  create(@Body() dto: CreateProductDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.products.create(dto, admin.id);
  }

  @Patch('products/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.products.update(id, dto, admin.id);
  }

  @Delete('products/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.products.softDelete(id, admin.id);
  }

  @Post('products/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.products.restore(id, admin.id);
  }

  @Post('products/:productId/variants')
  createVariant(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.products.createVariant(productId, dto, admin.id);
  }

  @Patch('variants/:variantId')
  updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.products.updateVariant(variantId, dto, admin.id);
  }
}
