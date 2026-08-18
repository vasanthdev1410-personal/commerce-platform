import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CartModule } from './modules/cart/cart.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CustomerManagementModule } from './modules/customer-management/customer-management.module';
import { AdminOrdersModule } from './modules/admin-orders/admin-orders.module';
import { FulfillmentModule } from './modules/fulfillment/fulfillment.module';
import { FinancialModule } from './modules/financial/financial.module';
import { validateEnvironment } from './config/environment.validation';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { LocationModule } from './modules/location/location.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    AdminModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    CartModule,
    CheckoutModule,
    PaymentsModule,
    CustomerManagementModule,
    AdminOrdersModule,
    FulfillmentModule,
    FinancialModule,
    ReviewsModule,
    LocationModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
