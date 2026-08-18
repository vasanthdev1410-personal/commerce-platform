import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class VerifyRazorpayPaymentDto { @IsUUID() orderId!:string; @IsString() @MaxLength(100) @Matches(/^pay_[A-Za-z0-9]+$/) razorpay_payment_id!:string; @IsString() @MaxLength(100) @Matches(/^order_[A-Za-z0-9]+$/) razorpay_order_id!:string; @IsString() @Matches(/^[a-f0-9]{64}$/) razorpay_signature!:string }
