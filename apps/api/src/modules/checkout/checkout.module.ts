

import { Module } from '@nestjs/common';import { AuthModule } from '../auth/auth.module';import { PricingModule } from '../pricing/pricing.module';import { FulfillmentModule } from '../fulfillment/fulfillment.module';import { FinancialModule } from '../financial/financial.module';import { CheckoutController } from './checkout.controller';import { CheckoutService } from './checkout.service';import { OrderReservationService } from './order-reservation.service';import { OrdersController } from './orders.controller';import { OrdersService } from './orders.service';
@Module({imports:[AuthModule,PricingModule,FulfillmentModule,FinancialModule],controllers:[CheckoutController,OrdersController],providers:[CheckoutService,OrderReservationService,OrdersService]})export class CheckoutModule{}


