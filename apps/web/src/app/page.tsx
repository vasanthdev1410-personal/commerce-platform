import type { Metadata } from 'next';
import Link from 'next/link';
import { CategoryCards } from '@/components/catalog/category-cards';
import { CatalogError } from '@/components/catalog/catalog-error';
import { ProductGrid } from '@/components/catalog/product-grid';
import { getCategories, getProducts } from '@/lib/api/catalog';

export const metadata: Metadata = { title: 'Home', description: 'Browse quality products for retail and wholesale.' };

export default async function Home() {
  const result = await Promise.all([getCategories(), getProducts({ limit: 8 })]).catch(() => null);
  if (!result) return <main className="px-4 py-20"><CatalogError /></main>;
  const [categories, products] = result;
  return <main>
    <section className="mx-auto max-w-6xl px-4 py-10"><h1 className="text-3xl font-semibold">Store</h1><p className="mt-2 text-neutral-700">Retail and wholesale product catalog.</p><Link href="/products" className="secondary-button mt-5">Browse products</Link></section>
    <section id="categories" className="mx-auto max-w-6xl border-t border-neutral-300 px-4 py-10"><h2 className="mb-5 text-2xl font-semibold">Categories</h2><CategoryCards categories={categories} /></section>
    <section className="mx-auto max-w-6xl border-t border-neutral-300 px-4 py-10"><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-2xl font-semibold">Products</h2><Link href="/products" className="underline">View all</Link></div><ProductGrid products={products.data} /></section>
  </main>;
}
