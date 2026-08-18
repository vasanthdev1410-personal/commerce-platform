import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { AuthModule } from '../auth/auth.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
@Module({ imports: [AuthModule, PricingModule], controllers: [CartController], providers: [CartService] })
export class CartModule {}
