import { IsInt, IsUUID, Max, Min } from 'class-validator';
export class AddCartItemDto { @IsUUID() variantId!: string; @IsInt() @Min(1) @Max(1_000_000) quantity!: number }
