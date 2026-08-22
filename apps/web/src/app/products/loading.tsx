import { ProductGridSkeleton } from '@/components/catalog/product-grid-skeleton';

export default function LoadingProducts() {
  return (
    <main className="mx-auto min-h-[70vh] max-w-[90rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div aria-hidden="true" className="h-4 w-32 animate-pulse rounded bg-[#e2dcd5]" />
      <div aria-hidden="true" className="mt-8 h-9 w-48 animate-pulse rounded bg-[#ded8d1]" />
      <div aria-hidden="true" className="mt-3 h-5 w-full max-w-lg animate-pulse rounded bg-[#e8e3dd]" />
      <div aria-hidden="true" className="catalog-panel my-8 h-36 animate-pulse border border-[var(--color-border)] bg-[var(--color-surface-secondary)] sm:h-28" />
      <ProductGridSkeleton count={10} />
    </main>
  );
}
