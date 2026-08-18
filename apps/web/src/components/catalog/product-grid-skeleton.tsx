export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return <div aria-label="Loading products" className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{Array.from({ length: count }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="aspect-square animate-pulse bg-slate-200"/><div className="space-y-3 p-4"><div className="h-5 animate-pulse rounded bg-slate-200"/><div className="h-4 w-2/3 animate-pulse rounded bg-slate-100"/></div></div>)}</div>;
}
