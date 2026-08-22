'use client';

import { useRouter } from 'next/navigation';

export function CatalogError({ message = 'We could not load the catalog right now. Please try again shortly.' }: { message?: string }) {
  const router = useRouter();

  return (
    <div role="alert" className="catalog-state mx-auto max-w-2xl border border-[#e0bcbc] bg-[#fff8f7] px-6 py-12 text-center">
      <div aria-hidden="true" className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#f6e5e2] text-xl text-[var(--color-danger)]">!</div>
      <h2 className="mt-4 text-xl font-semibold text-[var(--color-heading)]">Something went wrong</h2>
      <p className="mx-auto mt-2 max-w-md text-[var(--color-muted)]">{message}</p>
      <button type="button" onClick={() => router.refresh()} className="secondary-button mt-6">
        Try again
      </button>
    </div>
  );
}
