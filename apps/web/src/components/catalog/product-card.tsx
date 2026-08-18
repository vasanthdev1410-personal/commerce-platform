import Link from 'next/link';
import { ProductImage } from './product-image';
import { formatINR } from '@/lib/format-money';
import type { Product, StockStatus } from '@/types/catalog';

const stockLabels: Record<StockStatus, string> = {
  IN_STOCK: 'In stock', LOW_STOCK: 'Low stock', OUT_OF_STOCK: 'Out of stock',
};

export function ProductCard({ product }: { product: Product }) {
  const prices = product.variants.map((variant) => variant.retailPricePaise);
  const minimum = Math.min(...prices);
  const hasRange = prices.some((price) => price !== minimum);
  const available = product.variants.some((variant) => variant.stockStatus !== 'OUT_OF_STOCK');
  const status: StockStatus = available
    ? product.variants.some((variant) => variant.stockStatus === 'IN_STOCK') ? 'IN_STOCK' : 'LOW_STOCK'
    : 'OUT_OF_STOCK';

  return (
    <article className="overflow-hidden border border-neutral-300 bg-white">
      <Link href={`/products/${product.slug}`} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
        <div className="relative aspect-square overflow-hidden bg-neutral-100">
          <ProductImage src={product.primaryImage?.url} alt={product.primaryImage?.altText || product.name} />
        </div>
        <div className="p-4">
          <h2 className="line-clamp-2 min-h-12 font-semibold text-slate-950">{product.name}</h2>
          <p className="mt-2 font-bold text-slate-950">{hasRange ? 'From ' : ''}{formatINR(minimum)}</p>
          <p className={`mt-1 text-sm ${status === 'OUT_OF_STOCK' ? 'text-red-700' : status === 'LOW_STOCK' ? 'text-amber-700' : 'text-emerald-700'}`}>{stockLabels[status]}</p>
        </div>
      </Link>
    </article>
  );
}
