import { ProductCard } from './product-card';
import type { Product } from '@/types/catalog';

export function ProductGrid({
  products,
  emptyState,
  priorityCount = 0,
}: {
  products: Product[];
  emptyState?: React.ReactNode;
  priorityCount?: number;
}) {
  if (!products.length) {
    return emptyState ?? (
      <div className="catalog-state border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-[var(--color-heading)]">No products available</h2>
        <p className="mt-2 text-[var(--color-muted)]">Please check back again soon.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < priorityCount} />
      ))}
    </div>
  );
}
