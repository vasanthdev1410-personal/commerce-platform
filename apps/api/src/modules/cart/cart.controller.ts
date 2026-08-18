import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { UpdatePricingModeDto } from './dto/update-pricing-mode.dto';
@Controller('cart') @UseGuards(AccessTokenGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser) { return this.cart.get(user.id); }
  @Patch('pricing-mode') mode(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePricingModeDto) { return this.cart.setPricingMode(user.id, dto.pricingMode); }
  @Post('items') add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto) { return this.cart.add(user.id, dto.variantId, dto.quantity); }
  @Patch('items/:id') update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCartItemDto) { return this.cart.update(user.id, id, dto.quantity); }
  @Delete('items/:id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.cart.remove(user.id, id); }
  @Delete() clear(@CurrentUser() user: AuthenticatedUser) { return this.cart.clear(user.id); }
}
