'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { useCart } from '@/features/cart/cart-provider';
import { formatINR } from '@/lib/format-money';
import type { Order } from '@/types/order';
import DeliveryLocationPicker from '@/features/location/delivery-location-picker';
type Address = {
  id: string;
  label: string;
  addressLine1: string;
  isDefault: boolean;
};
export default function CheckoutPage() {
  const router = useRouter(),
    { isAuthenticated, isLoading, authenticatedRequest } = useAuth(),
    { cart, refresh } = useCart();
  const [addresses, setAddresses] = useState<Address[]>([]),
    [addressId, setAddressId] = useState(''),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState(false);
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
    if (!isLoading && isAuthenticated)
      void authenticatedRequest<Address[]>('/checkout/addresses').then(
        (data) => {
          setAddresses(data);
          setAddressId(data.find((a) => a.isDefault)?.id ?? data[0]?.id ?? '');
        },
      );
  }, [authenticatedRequest, isAuthenticated, isLoading, router]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget),
      payload = addressId
        ? { addressId }
        : {
            shippingAddress: {
              fullName: f.get('fullName'),
              phone: f.get('phone'),
              addressLine1: f.get('addressLine1'),
              addressLine2: f.get('addressLine2') || undefined,
              city: f.get('city'),
              state: f.get('state'),
              postalCode: f.get('postalCode'),
              countryCode: 'IN',
              ...(f.get('latitude') && f.get('longitude')
                ? {
                    latitude: Number(f.get('latitude')),
                    longitude: Number(f.get('longitude')),
                    locationProvider: f.get('locationProvider'),
                    providerPlaceId: f.get('providerPlaceId') || undefined,
                    formattedAddress: f.get('formattedAddress') || undefined,
                  }
                : {}),
            },
          };
    try {
      await authenticatedRequest('/checkout/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const order = await authenticatedRequest<Order>('/checkout/order', {
        method: 'POST',
        headers: {
          'Idempotency-Key': crypto.randomUUID() + crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });
      await refresh();
      router.push(`/orders/${order.id}`);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Checkout failed.');
      setPending(false);
    }
  };
  if (isLoading || !cart)
    return <main className="p-12">Loading checkout…</main>;
  if (!cart.items.length)
    return (
      <main className="p-12 text-center">
        <h1>Your cart is empty.</h1>
      </main>
    );
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-bold">Checkout</h1>
      <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-semibold">Shipping address</h2>
          {addresses.length > 0 && (
            <label className="mt-4 block">
              Saved address
              <select
                className="form-input mt-1"
                value={addressId}
                onChange={(e) => setAddressId(e.target.value)}
              >
                <option value="">Use a new address</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} — {a.addressLine1}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!addressId && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                ['fullName', 'Full name'],
                ['phone', 'Phone'],
                ['addressLine1', 'Address line 1'],
                ['addressLine2', 'Address line 2'],
                ['city', 'City'],
                ['state', 'State'],
                ['postalCode', 'Postal code'],
              ].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input
                    required={name !== 'addressLine2'}
                    name={name}
                    className="form-input mt-1"
                  />
                </label>
              ))}
            </div>
          )}
          {!addressId && <DeliveryLocationPicker />}
        </section>
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-semibold">Order Summary</h2>
          <p>{cart.pricingMode} pricing</p>
          {cart.items.map((i) => (
            <div
              key={i.cartItemId}
              className="flex justify-between border-b py-3"
            >
              <span>
                {i.productName} × {i.quantity}
              </span>
              <span>{formatINR(i.lineTotalPaise)}</span>
            </div>
          ))}
          <div className="mt-4 flex justify-between text-xl font-bold">
            <span>Subtotal</span>
            <span>{formatINR(cart.subtotalPaise)}</span>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-red-700">
              {error}
            </p>
          )}
          <button disabled={pending} className="primary-button mt-6">
            {pending ? 'Placing order…' : 'Place Order'}
          </button>
          <p className="mt-3 text-sm">
            Payment setup will be handled in the next step.
          </p>
        </section>
      </form>
    </main>
  );
}
