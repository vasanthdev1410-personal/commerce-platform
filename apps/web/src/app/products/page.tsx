import type { Metadata } from 'next';
import Link from 'next/link';
import { CatalogError } from '@/components/catalog/catalog-error';
import { ProductListing } from '@/components/catalog/product-listing';
import { getCategories, getProducts } from '@/lib/api/catalog';
import { parseCatalogQuery, type CatalogSearchParams } from '@/lib/catalog-query';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Browse the Pravokha catalog for quality retail and wholesale products.',
  alternates: { canonical: '/products' },
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const query = parseCatalogQuery(await searchParams);
  const result = await Promise.all([
    getCategories(),
    getProducts({ page: query.page, limit: 20, search: query.search, category: query.category, sort: query.sort }),
  ]).catch(() => null);

  return (
    <main className="mx-auto min-h-[70vh] max-w-[90rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-[var(--color-muted)]">
        <ol className="flex items-center gap-2">
          <li><Link href="/" className="hover:text-[var(--color-heading)] hover:underline">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-[var(--color-text)]">Products</li>
        </ol>
      </nav>
      <div className="mb-8 max-w-2xl sm:mb-10">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">The catalog</p>
        <h1 className="text-[1.875rem] font-bold tracking-[-0.025em] text-[var(--color-heading)] sm:text-4xl">Products</h1>
        <p className="mt-3 text-base leading-7 text-[var(--color-muted)]">Explore our current collection, with live availability and pricing from the catalog.</p>
      </div>
      {result ? (
        <ProductListing categories={result[0]} products={result[1]} query={query} />
      ) : (
        <CatalogError />
      )}
    </main>
  );
}
