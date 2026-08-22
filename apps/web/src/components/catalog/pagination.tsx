import Link from 'next/link';

type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

function paginationItems(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 1) return [];

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const visible = [...pages]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((left, right) => left - right);
  const items: PaginationItem[] = [];

  visible.forEach((value, index) => {
    const previous = visible[index - 1];
    if (previous && value - previous > 1) {
      items.push(previous === 1 ? 'ellipsis-start' : 'ellipsis-end');
    }
    items.push(value);
  });

  return items;
}

export function Pagination({
  page,
  totalPages,
  pathname = '/products',
  query,
}: {
  page: number;
  totalPages: number;
  pathname?: string;
  query: Record<string, string | undefined>;
}) {
  const items = paginationItems(page, totalPages);
  if (!items.length) return null;

  const href = (nextPage: number) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (nextPage > 1) params.set('page', String(nextPage));
    const search = params.toString();
    return search ? `${pathname}?${search}` : pathname;
  };

  return (
    <nav aria-label="Product pagination" className="mt-10 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-6 sm:justify-center">
      {page <= 1 ? (
        <span aria-disabled="true" className="inline-flex min-h-11 items-center justify-center border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-muted)] opacity-55 sm:px-4" style={{ borderRadius: 'var(--catalog-radius-sm)' }}>
          Previous
        </span>
      ) : (
        <Link href={href(page - 1)} rel="prev" className="secondary-button px-3 text-sm sm:px-4">
          Previous
        </Link>
      )}

      <div className="hidden items-center gap-1 sm:flex">
        {items.map((item) => item === 'ellipsis-start' || item === 'ellipsis-end' ? (
          <span key={item} aria-hidden="true" className="flex size-11 items-center justify-center text-[var(--color-muted)]">…</span>
        ) : (
          <Link
            key={item}
            href={href(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={`flex size-11 items-center justify-center border text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${item === page ? 'border-[var(--color-button-primary)] bg-[var(--color-button-primary)] text-white' : 'border-transparent bg-transparent text-[var(--color-text)] hover:border-[var(--color-border)] hover:bg-white'}`}
            style={{ borderRadius: 'var(--catalog-radius-sm)' }}
          >
            {item}
          </Link>
        ))}
      </div>

      <span className="text-sm font-medium text-[var(--color-muted)] sm:hidden">
        {page} / {totalPages}
      </span>

      {page >= totalPages ? (
        <span aria-disabled="true" className="inline-flex min-h-11 items-center justify-center border border-[var(--color-border)] bg-white px-3 text-sm font-medium text-[var(--color-muted)] opacity-55 sm:px-4" style={{ borderRadius: 'var(--catalog-radius-sm)' }}>
          Next
        </span>
      ) : (
        <Link href={href(page + 1)} rel="next" className="secondary-button px-3 text-sm sm:px-4">
          Next
        </Link>
      )}
    </nav>
  );
}
