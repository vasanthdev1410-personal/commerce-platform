'use client';
import { useState } from 'react';
import { ProductImage } from './product-image';
import type { ProductImage as ProductImageType } from '@/types/catalog';
export function ImageGallery({ images, productName }: { images: ProductImageType[]; productName: string }) {
  const ordered = images.length ? images : [{ id:'placeholder',url:'',altText:null }];
  const initial = ordered.find((image) => image.isPrimary) ?? ordered[0];
  const [selectedId,setSelectedId] = useState(initial.id); const selected = ordered.find((image) => image.id === selectedId) ?? initial;
  return <div><div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white"><ProductImage src={selected.url} alt={selected.altText || productName} priority sizes="(max-width: 1024px) 100vw, 50vw"/></div>{ordered.length > 1 && <div className="mt-4 grid grid-cols-5 gap-3" role="list" aria-label="Product images">{ordered.map((image,index) => <button type="button" key={image.id} onClick={() => setSelectedId(image.id)} aria-label={`View image ${index + 1} of ${productName}`} aria-pressed={selected.id === image.id} className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${selected.id === image.id ? 'border-blue-700' : 'border-transparent'}`}><ProductImage src={image.url} alt="" sizes="100px"/></button>)}</div>}</div>;
}
