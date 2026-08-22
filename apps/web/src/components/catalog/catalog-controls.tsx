'use client';

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Category } from '@/types/catalog';

const sorts = [
  ['newest', 'Newest'],
  ['price_low', 'Price: Low to High'],
  ['price_high', 'Price: High to Low'],
  ['name_asc', 'Name: A–Z'],
  ['name_desc', 'Name: Z–A'],
] as const;

interface CategoryContext {
  name: string;
  slug: string;
}

export function CatalogControls({
  categories,
  categoryContext,
}: {
  categories: Category[];
  categoryContext?: CategoryContext;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const currentSearch = current.get('search') ?? '';
  const activeCategory = categoryContext?.slug ?? current.get('category') ?? '';
  const activeCategoryName = categoryContext?.name ?? categories.find(({ slug }) => slug === activeCategory)?.name;
  const [search, setSearch] = useState(currentSearch);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileCategory, setMobileCategory] = useState(activeCategory);
  const [isPending, startTransition] = useTransition();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [drawerOpen]);

  const push = useCallback((targetPath: string, params: URLSearchParams) => {
    params.delete('page');
    const query = params.toString();
    startTransition(() => router.push(query ? `${targetPath}?${query}` : targetPath, { scroll: false }));
  }, [router]);

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(current.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    push(pathname, params);
  }, [current, pathname, push]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update('search', search.trim().slice(0, 100));
  }

  function selectCategory(slug: string) {
    const params = new URLSearchParams(current.toString());
    params.delete('category');
    if (categoryContext) {
      push(slug ? `/categories/${encodeURIComponent(slug)}` : '/products', params);
      return;
    }
    if (slug) params.set('category', slug);
    push(pathname, params);
  }

  function clearAll() {
    const params = new URLSearchParams(current.toString());
    params.delete('search');
    params.delete('category');
    setSearch('');
    push(categoryContext ? '/products' : pathname, params);
  }

  function openDrawer() {
    setMobileCategory(activeCategory);
    setDrawerOpen(true);
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setDrawerOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), a[href]');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const hasActiveDiscoveryState = Boolean(currentSearch || activeCategory);

  return (
    <div className="mb-7">
      <div className="catalog-panel border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(12rem,0.48fr)_minmax(12rem,0.42fr)]">
          <form role="search" onSubmit={submitSearch} className="min-w-0">
            <label htmlFor="catalog-search" className="form-label">Search products</label>
            <div className="relative">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--color-muted)]">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.7-3.7" />
              </svg>
              <input
                id="catalog-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by product name or SKU"
                maxLength={100}
                className="form-input pl-10 pr-20"
              />
              {search ? (
                <button type="button" onClick={() => { setSearch(''); update('search', ''); }} className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 px-2 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-heading)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
                  Clear
                </button>
              ) : null}
            </div>
          </form>

          <label className="hidden text-sm font-medium text-[var(--color-text)] sm:block">
            Category
            <select value={activeCategory} onChange={(event) => selectCategory(event.target.value)} className="form-input mt-1.5">
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
            </select>
          </label>

          <div className="grid min-w-0 grid-cols-2 gap-3 sm:block">
            <button type="button" onClick={openDrawer} aria-haspopup="dialog" aria-expanded={drawerOpen} className="secondary-button w-full gap-2 text-sm sm:hidden">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5"><path d="M4 6h16M7 12h10m-7 6h4" /></svg>
              Filter{activeCategory ? ' (1)' : ''}
            </button>
            <label className="block min-w-0 text-sm font-medium text-[var(--color-text)]">
              <span className="sr-only sm:not-sr-only">Sort by</span>
              <select aria-label="Sort products" value={current.get('sort') ?? 'newest'} onChange={(event) => update('sort', event.target.value)} className="form-input sm:mt-1.5">
                {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>
        <p aria-live="polite" className="sr-only">{isPending ? 'Updating catalog' : ''}</p>
      </div>

      {hasActiveDiscoveryState ? (
        <div aria-label="Active product filters" className="mt-3 flex flex-wrap items-center gap-2">
          {currentSearch ? (
            <button type="button" onClick={() => { setSearch(''); update('search', ''); }} className="catalog-chip inline-flex min-h-9 items-center gap-2 border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]">
              Search: <span className="max-w-40 truncate font-semibold">{currentSearch}</span><span aria-hidden="true">×</span><span className="sr-only">Remove search filter</span>
            </button>
          ) : null}
          {activeCategory ? (
            <button type="button" onClick={() => selectCategory('')} className="catalog-chip inline-flex min-h-9 items-center gap-2 border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]">
              Category: <span className="max-w-40 truncate font-semibold">{activeCategoryName ?? activeCategory}</span><span aria-hidden="true">×</span><span className="sr-only">Remove category filter</span>
            </button>
          ) : null}
          <button type="button" onClick={clearAll} className="min-h-9 px-2 text-sm font-semibold text-[var(--color-accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
            Clear all
          </button>
        </div>
      ) : null}

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button type="button" aria-label="Close filters" onClick={() => setDrawerOpen(false)} className="absolute inset-0 size-full bg-black/35" />
          <div role="dialog" aria-modal="true" aria-labelledby="filter-title" onKeyDown={handleDrawerKeyDown} className="catalog-sheet absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-4">
              <h2 id="filter-title" className="text-xl font-semibold text-[var(--color-heading)]">Filter products</h2>
              <button ref={closeButtonRef} type="button" onClick={() => setDrawerOpen(false)} aria-label="Close filters" className="flex size-11 items-center justify-center text-2xl text-[var(--color-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">×</button>
            </div>
            <label className="mt-5 block text-sm font-medium text-[var(--color-text)]">
              Category
              <select value={mobileCategory} onChange={(event) => setMobileCategory(event.target.value)} className="form-input mt-1.5">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
              </select>
            </label>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setMobileCategory('')} className="secondary-button">Clear</button>
              <button type="button" onClick={() => { selectCategory(mobileCategory); setDrawerOpen(false); }} className="primary-button">Apply</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
