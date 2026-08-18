import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { getCategory, getProducts } from '@/lib/api/catalog';
import { ProductGrid } from '@/components/catalog/product-grid';
import { CatalogError } from '@/components/catalog/catalog-error';
export async function generateMetadata({ params }: { params: Promise<{ slug:string }> }): Promise<Metadata> { const { slug } = await params; try { const category = await getCategory(slug); return { title:category.name,description:category.description || `Browse ${category.name} products.` }; } catch { return { title:'Category' }; } }
export default async function CategoryPage({ params }: { params: Promise<{ slug:string }> }) { const { slug } = await params; const result = await Promise.all([getCategory(slug),getProducts({ category:slug,limit:20 })]).catch((error: unknown) => { if (error instanceof ApiError && error.status === 404) notFound(); return null; }); if (!result) return <main className="px-4 py-20"><CatalogError/></main>; const [category,products] = result; return <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Category</p><h1 className="mt-2 text-4xl font-bold tracking-tight">{category.name}</h1>{category.description && <p className="mt-4 max-w-3xl text-lg text-slate-600">{category.description}</p>}<div className="mt-10"><ProductGrid products={products.data}/></div></main>; }
