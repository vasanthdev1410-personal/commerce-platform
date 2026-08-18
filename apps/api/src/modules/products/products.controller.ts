import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ProductQueryDto) {
    return this.products.listPublic(query);
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.products.getPublic(slug);
  }
}
