import type { Metadata } from 'next';
import { CatalogControls } from '@/components/catalog/catalog-controls';
import { CatalogError } from '@/components/catalog/catalog-error';
import { Pagination } from '@/components/catalog/pagination';
import { ProductGrid } from '@/components/catalog/product-grid';
import { getCategories, getProducts, PRODUCT_SORT_VALUES, type ProductSort } from '@/lib/api/catalog';
export const metadata: Metadata = { title: 'Products', description: 'Browse the product catalog.' };
type Params = { page?: string; search?: string; category?: string; sort?: string };
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams; const page = Math.max(1, Number.parseInt(params.page ?? '1',10) || 1); const sort: ProductSort = PRODUCT_SORT_VALUES.includes(params.sort as ProductSort) ? params.sort as ProductSort : 'newest';
  const result = await Promise.all([getCategories(),getProducts({ page,limit:20,search:params.search?.slice(0,100),category:params.category?.slice(0,180),sort })]).catch(() => null);
  if (!result) return <main className="px-4 py-20"><CatalogError/></main>;
  const [categories,products] = result;
  return <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><h1 className="text-4xl font-bold tracking-tight">Products</h1><p className="mt-3 text-slate-600">Browse our current retail catalog.</p><div className="mt-8"><CatalogControls categories={categories}/><ProductGrid products={products.data}/><Pagination page={products.pagination.page} totalPages={products.pagination.totalPages} query={{ search:params.search,category:params.category,sort:sort === 'newest' ? undefined : sort }}/></div></main>;
}
