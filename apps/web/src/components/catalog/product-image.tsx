'use client';

import Image from 'next/image';
import { useState } from 'react';

export function ProductImage({ src, alt, priority = false, sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw' }: { src?: string | null; alt: string; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      src={!src || failed ? '/product-placeholder.svg' : src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
