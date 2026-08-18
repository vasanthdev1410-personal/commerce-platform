import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footerText: string;
  footerLink: string;
  footerLabel: string;
}

export function AuthShell({
  title,
  description,
  children,
  footerText,
  footerLink,
  footerLabel,
}: AuthShellProps) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-white px-4 py-10">
      <section className="w-full max-w-md border border-neutral-300 bg-white p-6">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold text-neutral-950">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-700">{description}</p>
        </div>
        {children}
        <p className="mt-7 text-center text-sm text-neutral-700">
          {footerText}{' '}
          <Link
            className="font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            href={footerLink}
          >
            {footerLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}
