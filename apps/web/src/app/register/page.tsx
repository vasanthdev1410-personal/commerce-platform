'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { FormError } from '@/components/auth/form-error';
import { PasswordField } from '@/components/auth/password-field';
import { useAuth } from '@/features/auth/auth-provider';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, isLoading } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/account');
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords must match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ firstName, lastName, email, password });
      setPassword('');
      setConfirmPassword('');
      router.replace('/account');
    } catch (caught) {
      setPassword('');
      setConfirmPassword('');
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to create your account. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p aria-live="polite" className="text-sm text-slate-600">
          Checking your session…
        </p>
      </main>
    );
  }

  return (
    <AuthShell
      description="Create a retail customer account to get started."
      footerLabel="Sign in"
      footerLink="/login"
      footerText="Already have an account?"
      title="Create your account"
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <FormError message={error} />
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="form-label" htmlFor="firstName">
              First name
            </label>
            <input
              autoComplete="given-name"
              className="form-input"
              id="firstName"
              maxLength={100}
              onChange={(event) => setFirstName(event.target.value)}
              required
              type="text"
              value={firstName}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="lastName">
              Last name
            </label>
            <input
              autoComplete="family-name"
              className="form-input"
              id="lastName"
              maxLength={100}
              onChange={(event) => setLastName(event.target.value)}
              required
              type="text"
              value={lastName}
            />
          </div>
        </div>
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
          aria-describedby="password-help"
          autoComplete="new-password"
          id="password"
          label="Password"
          maxLength={128}
          minLength={10}
          onChange={(event) => setPassword(event.target.value)}
          required
          value={password}
        />
        <p className="-mt-3 text-xs text-slate-500" id="password-help">
          Use 10–128 characters. Strong passphrases are welcome.
        </p>
        <PasswordField
          autoComplete="new-password"
          id="confirmPassword"
          label="Confirm password"
          maxLength={128}
          minLength={10}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          value={confirmPassword}
        />
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
