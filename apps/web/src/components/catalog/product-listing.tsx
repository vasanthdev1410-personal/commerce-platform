import Link from 'next/link';
import { CatalogControls } from './catalog-controls';
import { Pagination } from './pagination';
import { ProductGrid } from './product-grid';
import type { ProductSort } from '@/lib/api/catalog';
import type { Category, ProductPage } from '@/types/catalog';

interface ListingQuery {
  search?: string;
  category?: string;
  sort: ProductSort;
}

export function ProductListing({
  categories,
  products,
  query,
  pathname = '/products',
  categoryContext,
}: {
  categories: Category[];
  products: ProductPage;
  query: ListingQuery;
  pathname?: string;
  categoryContext?: { name: string; slug: string };
}) {
  const { data, pagination } = products;
  const start = data.length ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const end = data.length ? start + data.length - 1 : 0;
  const plural = pagination.total === 1 ? 'product' : 'products';
  const hasFilters = Boolean(query.search || query.category || categoryContext);

  let emptyTitle = 'No products available yet';
  let emptyMessage = 'The catalog is currently empty. Please check back again soon.';
  if (query.search) {
    emptyTitle = `No products found for “${query.search}”`;
    emptyMessage = 'Try a broader search or clear the current filters.';
  } else if (query.category || categoryContext) {
    emptyTitle = 'No products match this category';
    emptyMessage = 'Browse all products or choose another category.';
  }

  const emptyState = (
    <div className="catalog-state border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-14 text-center sm:px-8 sm:py-20">
      <div aria-hidden="true" className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] text-[var(--color-accent)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-6"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></svg>
      </div>
      <h2 className="mt-4 text-xl font-semibold text-[var(--color-heading)]">{emptyTitle}</h2>
      <p className="mx-auto mt-2 max-w-md text-[var(--color-muted)]">{emptyMessage}</p>
      {hasFilters ? <Link href="/products" className="secondary-button mt-6">Clear search and filters</Link> : null}
    </div>
  );

  return (
    <section aria-label="Product results">
      <CatalogControls
        key={`${query.search ?? ''}:${query.category ?? categoryContext?.slug ?? ''}:${query.sort}`}
        categories={categories}
        categoryContext={categoryContext}
      />
      <div className="mb-5 flex min-h-6 flex-wrap items-end justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {pagination.total > 0
            ? <>Showing <span className="font-bold">{start}–{end}</span> of <span className="font-bold">{pagination.total}</span> {plural}</>
            : <>0 products</>}
        </p>
        {pagination.totalPages > 1 ? <p className="text-xs text-[var(--color-muted)]">Page {pagination.page} of {pagination.totalPages}</p> : null}
      </div>
      <ProductGrid products={data} emptyState={emptyState} priorityCount={4} />
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        pathname={pathname}
        query={{
          search: query.search,
          category: categoryContext ? undefined : query.category,
          sort: query.sort === 'newest' ? undefined : query.sort,
        }}
      />
    </section>
  );
}
