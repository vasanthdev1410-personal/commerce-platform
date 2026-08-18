'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FormError } from '@/components/auth/form-error';
import { useAuth } from '@/features/auth/auth-provider';

export default function AccountPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout, logoutAll } = useAuth();
  const [pendingAction, setPendingAction] = useState<'logout' | 'all' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  async function handleLogout(allDevices: boolean) {
    setError(null);
    setPendingAction(allDevices ? 'all' : 'logout');
    try {
      if (allDevices) await logoutAll();
      else await logout();
      router.replace('/login');
    } catch (caught) {
      router.replace('/login');
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to complete logout. Please try again.',
      );
    } finally {
      setPendingAction(null);
    }
  }

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p aria-live="polite" className="text-sm text-slate-600">
          {isLoading ? 'Restoring your session…' : 'Redirecting to sign in…'}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-16">
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-blue-700">
          Customer account
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Welcome, {user.firstName}
        </h1>
        <p className="mt-2 text-slate-600">
          Your authenticated account details are shown below.
        </p>

        <dl className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200">
          <AccountDetail label="Email" value={user.email} />
          <AccountDetail label="Account type" value={user.accountType} />
          <AccountDetail label="Wholesale status" value={user.wholesaleStatus} />
          <AccountDetail label="Role" value={user.role} />
        </dl>

        <div className="mt-6">
          <FormError message={error} />
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/account/orders" className="secondary-button">Order history</Link>
          <button
            className="primary-button sm:w-auto"
            disabled={pendingAction !== null}
            onClick={() => void handleLogout(false)}
            type="button"
          >
            {pendingAction === 'logout' ? 'Logging out…' : 'Logout'}
          </button>
          <button
            className="secondary-button"
            disabled={pendingAction !== null}
            onClick={() => void handleLogout(true)}
            type="button"
          >
            {pendingAction === 'all' ? 'Logging out…' : 'Logout all devices'}
          </button>
        </div>
      </section>
    </main>
  );
}

function AccountDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="break-words text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
