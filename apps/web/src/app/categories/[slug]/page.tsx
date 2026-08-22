import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CatalogError } from '@/components/catalog/catalog-error';
import { ProductListing } from '@/components/catalog/product-listing';
import { getCategories, getCategory, getProducts } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/client';
import { parseCatalogQuery, type CatalogSearchParams } from '@/lib/catalog-query';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}

export async function generateMetadata({ params }: Pick<CategoryPageProps, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  try {
    const category = await getCategory(slug);
    return {
      title: category.name,
      description: category.description || `Browse ${category.name} products in the Pravokha catalog.`,
      alternates: { canonical: `/categories/${encodeURIComponent(category.slug)}` },
    };
  } catch {
    return { title: 'Category', robots: { index: false, follow: false } };
  }
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const query = parseCatalogQuery(rawQuery);
  const result = await Promise.all([
    getCategory(slug),
    getCategories(),
    getProducts({ category: slug, page: query.page, limit: 20, search: query.search, sort: query.sort }),
  ]).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    return null;
  });

  if (!result) {
    return (
      <main className="mx-auto min-h-[70vh] max-w-[90rem] px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-bold text-[var(--color-heading)]">Category</h1>
        <CatalogError />
      </main>
    );
  }

  const [category, categories, products] = result;
  const pathname = `/categories/${encodeURIComponent(category.slug)}`;

  return (
    <main className="mx-auto min-h-[70vh] max-w-[90rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-[var(--color-muted)]">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-[var(--color-heading)] hover:underline">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/products" className="hover:text-[var(--color-heading)] hover:underline">Products</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-[var(--color-text)]">{category.name}</li>
        </ol>
      </nav>
      <div className="mb-8 max-w-3xl sm:mb-10">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">Category</p>
        <h1 className="text-[1.875rem] font-bold tracking-[-0.025em] text-[var(--color-heading)] sm:text-4xl">{category.name}</h1>
        {category.description ? <p className="mt-3 text-base leading-7 text-[var(--color-muted)] sm:text-lg">{category.description}</p> : null}
      </div>
      <ProductListing
        categories={categories}
        products={products}
        query={{ ...query, category: undefined }}
        pathname={pathname}
        categoryContext={{ name: category.name, slug: category.slug }}
      />
    </main>
  );
}
