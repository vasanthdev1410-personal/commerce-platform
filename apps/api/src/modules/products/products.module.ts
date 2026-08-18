import { Module } from '@nestjs/common';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { AdminProductImagesController } from './admin-product-images.controller';
import { AdminProductsController } from './admin-products.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductImagesService } from './product-images.service';

@Module({
  imports: [AuthModule, AdminAuditModule, StorageModule],
  controllers: [
    ProductsController,
    AdminProductsController,
    AdminProductImagesController,
  ],
  providers: [ProductsService, ProductImagesService],
})
export class ProductsModule {}
