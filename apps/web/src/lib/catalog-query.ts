import { PRODUCT_SORT_VALUES, type ProductSort } from '@/lib/api/catalog';

export interface CatalogSearchParams {
  page?: string;
  search?: string;
  category?: string;
  sort?: string;
}

export interface ParsedCatalogQuery {
  page: number;
  search?: string;
  category?: string;
  sort: ProductSort;
}

function clean(value: string | undefined, maximumLength: number): string | undefined {
  const cleaned = value?.trim().slice(0, maximumLength);
  return cleaned || undefined;
}

export function parseCatalogQuery(params: CatalogSearchParams): ParsedCatalogQuery {
  const parsedPage = Number.parseInt(params.page ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const sort = PRODUCT_SORT_VALUES.includes(params.sort as ProductSort)
    ? params.sort as ProductSort
    : 'newest';

  return {
    page,
    search: clean(params.search, 100),
    category: clean(params.category, 180),
    sort,
  };
}
