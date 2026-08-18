import Link from 'next/link';
import type { Category } from '@/types/catalog';

export function CategoryCards({ categories }: { categories: Category[] }) {
  if (!categories.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">Categories will appear here when available.</div>;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{categories.map((category) => <Link key={category.id} href={`/categories/${category.slug}`} className="border border-neutral-300 bg-white p-4 focus-visible:outline-2 focus-visible:outline-black"><h3 className="font-medium">{category.name}</h3><p className="mt-2 line-clamp-2 text-sm text-neutral-700">{category.description || 'Explore products in this category.'}</p><span className="mt-3 inline-block text-sm underline">Browse category</span></Link>)}</div>;
}
