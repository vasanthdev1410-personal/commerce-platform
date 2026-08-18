import type { PricingMode } from './pricing';
import type { StockStatus } from './catalog';
export interface CartItem { cartItemId:string; variantId:string; productId:string; productSlug:string; productName:string; variantName:string; attributes:Record<string,unknown>; image:{url:string;altText:string|null}|null; quantity:number; unitPricePaise:number; lineTotalPaise:number; stockStatus:StockStatus; isAvailable:boolean }
export interface Cart { id:string; pricingMode:PricingMode; items:CartItem[]; itemCount:number; subtotalPaise:number }
