'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Category } from '@/types/catalog';
const sorts = [['newest','Newest'],['price_low','Price: Low to High'],['price_high','Price: High to Low'],['name_asc','Name: A–Z'],['name_desc','Name: Z–A']] as const;
export function CatalogControls({ categories }: { categories: Category[] }) {
  const router = useRouter(); const pathname = usePathname(); const current = useSearchParams();
  const [search, setSearch] = useState(current.get('search') ?? '');
  const update = useCallback((key: string, value: string) => { const params = new URLSearchParams(current.toString()); if (value) params.set(key, value); else params.delete(key); params.delete('page'); router.push(`${pathname}?${params.toString()}`); }, [current, pathname, router]);
  useEffect(() => { const timeout = setTimeout(() => { if (search !== (current.get('search') ?? '')) update('search', search.trim()); }, 400); return () => clearTimeout(timeout); }, [current, search, update]);
  return <div className="mb-8 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3"><label className="text-sm font-medium text-slate-700">Search products<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or SKU" className="form-input mt-1.5" /></label><label className="text-sm font-medium text-slate-700">Category<select value={current.get('category') ?? ''} onChange={(event) => update('category', event.target.value)} className="form-input mt-1.5"><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Sort by<select value={current.get('sort') ?? 'newest'} onChange={(event) => update('sort', event.target.value)} className="form-input mt-1.5">{sorts.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>;
}
