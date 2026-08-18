import { ProductCard } from './product-card';
import type { Product } from '@/types/catalog';

export function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="text-lg font-semibold">No products found</h2><p className="mt-2 text-slate-600">Try changing your search or filters.</p></div>;
  return <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>;
}
