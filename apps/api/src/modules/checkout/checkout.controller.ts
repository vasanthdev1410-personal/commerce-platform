import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';import { AccessTokenGuard } from '../auth/guards/access-token.guard';import type { AuthenticatedUser } from '../auth/auth.types';
import { CheckoutService } from './checkout.service';import { CheckoutAddressDto } from './dto/checkout-address.dto';
@Controller('checkout') @UseGuards(AccessTokenGuard)
export class CheckoutController {constructor(private readonly checkout:CheckoutService){}@Get('addresses')addresses(@CurrentUser()u:AuthenticatedUser){return this.checkout.addresses(u.id)}@Post('preview')preview(@CurrentUser()u:AuthenticatedUser,@Body()dto:CheckoutAddressDto){return this.checkout.preview(u.id,dto)}@Post('order')order(@CurrentUser()u:AuthenticatedUser,@Headers('idempotency-key')key:string|undefined,@Body()dto:CheckoutAddressDto){return this.checkout.create(u.id,key,dto)}}
