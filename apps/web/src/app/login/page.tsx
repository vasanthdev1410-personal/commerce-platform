'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { FormError } from '@/components/auth/form-error';
import { PasswordField } from '@/components/auth/password-field';
import { useAuth } from '@/features/auth/auth-provider';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/account');
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      setPassword('');
      router.replace('/account');
    } catch (caught) {
      setPassword('');
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to sign in. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || isAuthenticated) {
    return <PageLoading label="Checking your session…" />;
  }

  return (
    <AuthShell
      description="Sign in securely to access your customer account."
      footerLabel="Create an account"
      footerLink="/register"
      footerText="New customer?"
      title="Welcome back"
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <FormError message={error} />
        <div>
          <label className="form-label" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="email"
            className="form-input"
            id="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </div>
        <PasswordField
          autoComplete="current-password"
          id="password"
          label="Password"
          onChange={(event) => setPassword(event.target.value)}
          required
          value={password}
        />
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}

function PageLoading({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <p aria-live="polite" className="text-sm text-slate-600">
        {label}
      </p>
    </main>
  );
}
