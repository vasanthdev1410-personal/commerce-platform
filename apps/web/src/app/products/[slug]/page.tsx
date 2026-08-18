import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { getProduct } from '@/lib/api/catalog';
import { CatalogError } from '@/components/catalog/catalog-error';
import { ImageGallery } from '@/components/catalog/image-gallery';
import { VariantSelector } from '@/components/catalog/variant-selector';
import ProductReviews from '@/features/reviews/product-reviews';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await getProduct(slug);
    return {
      title: product.name,
      description: product.description || undefined,
    };
  } catch {
    return { title: 'Product' };
  }
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    return null;
  });
  if (!product)
    return (
      <main className="px-4 py-20">
        <CatalogError />
      </main>
    );
  const images = product.images?.length
    ? product.images
    : product.primaryImage
      ? [product.primaryImage]
      : [];
  return (
    <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-600">
        <Link href="/products" className="hover:text-blue-700">
          Products
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{product.name}</span>
      </nav>
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <ImageGallery images={images} productName={product.name} />
        <section>
          <div className="flex flex-wrap gap-2">
            {product.categories.map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800"
              >
                {category.name}
              </Link>
            ))}
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950">
            {product.name}
          </h1>
          {product.description && (
            <p className="mt-5 whitespace-pre-line text-lg leading-8 text-slate-600">
              {product.description}
            </p>
          )}
          <div className="mt-8">
            <VariantSelector variants={product.variants} />
          </div>
        </section>
      </div>
      {/* <ProductReviews productId={product.id} /> */}
      <ProductReviews productId={product.id} />
    </main>
  );
}
