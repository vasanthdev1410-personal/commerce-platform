'use client';

import Link from 'next/link';
import { useAuth } from '@/features/auth/auth-provider';
import { useCart } from '@/features/cart/cart-provider';

export function SiteHeader() {
  const { isAuthenticated, isLoading } = useAuth();
  const { cart } = useCart();
  return (
    <header className="border-b border-neutral-300 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold focus-visible:outline-2 focus-visible:outline-black">
          Store
        </Link>
        <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-4 text-sm text-neutral-800">
          <Link href="/">Home</Link>
          <Link href="/products">Products</Link>
          <Link href="/#categories">Categories</Link>
          <Link href="/account">Account</Link>
          {isAuthenticated && <Link href="/cart">Cart{cart ? ` (${cart.itemCount})` : ''}</Link>}
          {isAuthenticated && cart && cart.itemCount > 0 && <Link href="/checkout">Checkout</Link>}
          {!isLoading && !isAuthenticated ? (
            <><Link href="/login">Login</Link><Link href="/register">Register</Link></>
          ) : isLoading ? <span className="text-neutral-500" aria-label="Loading account">Loading…</span> : null}
        </nav>
      </div>
    </header>
  );
}
