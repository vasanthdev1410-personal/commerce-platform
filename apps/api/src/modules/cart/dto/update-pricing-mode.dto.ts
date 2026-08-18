import { IsEnum } from 'class-validator';
import { PricingMode } from '../../../generated/prisma/enums';
export class UpdatePricingModeDto { @IsEnum(PricingMode) pricingMode!: PricingMode }
