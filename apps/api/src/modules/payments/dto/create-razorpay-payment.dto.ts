import { IsUUID } from 'class-validator';
export class CreateRazorpayPaymentDto { @IsUUID() orderId!:string }
