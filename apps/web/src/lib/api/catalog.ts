import { apiRequest } from './client';
import type { Category, Product, ProductPage } from '@/types/catalog';

export const PRODUCT_SORT_VALUES = [
  'newest', 'price_low', 'price_high', 'name_asc', 'name_desc',
] as const;
export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];

export interface CatalogQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  sort?: ProductSort;
}

export function getCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/categories', { next: { revalidate: 60 } });
}

export function getCategory(slug: string): Promise<Category> {
  return apiRequest<Category>(`/categories/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
}

export function getProducts(query: CatalogQuery = {}): Promise<ProductPage> {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 20),
    sort: query.sort ?? 'newest',
  });
  if (query.search) params.set('search', query.search);
  if (query.category) params.set('category', query.category);
  return apiRequest<ProductPage>(`/products?${params}`, { cache: 'no-store' });
}

export function getProduct(slug: string): Promise<Product> {
  return apiRequest<Product>(`/products/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
}
