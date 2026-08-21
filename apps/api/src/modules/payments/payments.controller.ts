import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateRazorpayPaymentDto } from './dto/create-razorpay-payment.dto';
import { VerifyRazorpayPaymentDto } from './dto/verify-razorpay-payment.dto';
import { RazorpayService } from './razorpay.service';

@Controller()
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('CUSTOMER')
export class PaymentsController {
  constructor(private readonly razorpay: RazorpayService) {}

  @Post('payments/razorpay/create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRazorpayPaymentDto) {
    return this.razorpay.create(user.id, dto.orderId);
  }

  @Post('payments/razorpay/verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyRazorpayPaymentDto) {
    return this.razorpay.verify(user.id, dto);
  }

  @Get('orders/:orderId/payment')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.razorpay.status(user.id, orderId);
  }
}
