export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  position?: number;
  isPrimary?: boolean;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, unknown>;
  retailPricePaise: number;
  wholesalePricePaise: number | null;
  wholesaleMinQty: number;
  isActive: boolean;
  stockStatus: StockStatus;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categories: Category[];
  variants: ProductVariant[];
  primaryImage: ProductImage | null;
  images?: ProductImage[];
}

export interface ProductPage {
  data: Product[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
