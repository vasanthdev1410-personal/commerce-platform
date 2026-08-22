export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading products" className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      <span className="sr-only">Loading products</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden="true" className="catalog-card overflow-hidden border border-[var(--color-border)] bg-white">
          <div className="aspect-square animate-pulse bg-[var(--color-surface-secondary)]" />
          <div className="space-y-3 p-3 sm:p-4">
            <div className="h-3 w-2/5 animate-pulse rounded bg-[#e2dcd5]" />
            <div className="h-5 animate-pulse rounded bg-[#ded8d1]" />
            <div className="h-5 w-3/5 animate-pulse rounded bg-[#e8e3dd]" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-[#e8e3dd]" />
          </div>
        </div>
      ))}
    </div>
  );
}
