import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth, signIn } from '@/auth';
import { Card } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const session = await auth();
  if (session?.user) redirect(callbackUrl ?? '/');

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-20">
      <Card className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to run an audit</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          We use your Google account to identify you and keep your audit history together. We
          receive your name and email address &mdash; never access to your Gmail, Drive or contacts.
        </p>

        {error && (
          <p
            className="mt-4 rounded-lg px-3 py-2 text-sm"
            role="alert"
            style={{ background: 'var(--status-critical-soft)', color: 'var(--status-critical)' }}
          >
            {error === 'AccessDenied'
              ? 'That account could not be signed in.'
              : 'Something went wrong signing in. Please try again.'}
          </p>
        )}

        <form
          className="mt-6"
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: callbackUrl ?? '/' });
          }}
        >
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-lg border text-sm font-medium transition-colors hover:bg-[var(--surface-2)]"
            style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>

        <p className="mt-5 text-xs" style={{ color: 'var(--text-muted)' }}>
          We store your email address and the websites you audit, so you can come back to your
          reports. Nothing else.
        </p>
      </Card>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
