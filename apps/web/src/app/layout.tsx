import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/features/auth/auth-provider';
import { SiteHeader } from '@/components/catalog/site-header';
import { CartProvider } from '@/features/cart/cart-provider';

export const metadata: Metadata = {
  title: { default: 'Store', template: '%s | Store' },
  description: 'Development storefront.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <CartProvider>
            <SiteHeader />
            {children}
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
