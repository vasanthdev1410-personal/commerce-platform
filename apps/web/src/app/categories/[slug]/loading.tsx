import { ProductGridSkeleton } from '@/components/catalog/product-grid-skeleton';
export default function LoadingCategory() { return <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="h-10 w-64 animate-pulse rounded bg-slate-200"/><div className="mt-10"><ProductGridSkeleton count={8}/></div></main>; }
