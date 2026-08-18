import { ProductGridSkeleton } from '@/components/catalog/product-grid-skeleton';
export default function LoadingProducts() { return <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="h-10 w-48 animate-pulse rounded bg-slate-200"/><div className="my-8 h-28 animate-pulse rounded-2xl bg-slate-200"/><ProductGridSkeleton count={8}/></main>; }
