import Link from 'next/link';
import { ProductImage } from './product-image';
import { formatINR } from '@/lib/format-money';
import type { Product } from '@/types/catalog';

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const prices = product.variants.map((variant) => variant.retailPricePaise);
  const minimum = prices.length ? Math.min(...prices) : null;
  const hasRange = minimum !== null && prices.some((price) => price !== minimum);
  const available = product.variants.some((variant) => variant.stockStatus !== 'OUT_OF_STOCK');
  const category = product.categories[0];

  return (
    <article className="catalog-card group h-full overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
      <Link
        href={`/products/${encodeURIComponent(product.slug)}`}
        prefetch={false}
        className="flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <div className="relative aspect-square overflow-hidden bg-[var(--color-surface-secondary)]">
          <ProductImage
            src={product.primaryImage?.url}
            alt={product.primaryImage?.altText || product.name}
            priority={priority}
          />
        </div>
        <div className="flex flex-1 flex-col p-3 sm:p-4">
          {category ? (
            <p className="mb-1.5 truncate text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-accent)]">
              {category.name}
            </p>
          ) : null}
          <h2 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[var(--color-heading)] sm:min-h-12 sm:text-base sm:leading-6">
            {product.name}
          </h2>
          <div className="mt-auto pt-3">
            <p className="break-words text-sm font-bold tracking-tight text-[var(--color-heading)] min-[360px]:text-base sm:text-lg">
              {minimum === null ? 'Price unavailable' : `${hasRange ? 'From ' : ''}${formatINR(minimum)}`}
            </p>
            <p
              className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium sm:text-sm ${available ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
            >
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
              {available ? 'In stock' : 'Out of stock'}
            </p>
          </div>
        </div>
      </Link>
    </article>
  );
}
