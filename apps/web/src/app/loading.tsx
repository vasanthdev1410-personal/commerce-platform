import { ProductGridSkeleton } from '@/components/catalog/product-grid-skeleton';

export default function LoadingHome() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-12 h-64 animate-pulse rounded-2xl bg-slate-200" />
      <ProductGridSkeleton count={8} />
    </main>
  );
}
