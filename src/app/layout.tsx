import type { Metadata, Viewport } from 'next';
import { auth, signOut } from '@/auth';
import { appUrl } from '@/lib/app-url';
import './globals.css';

// The agency's own name, not the product's — this is the discreet white-label
// slot in the report footer. Set NEXT_PUBLIC_AGENCY_NAME before launch.
const AGENCY = process.env['NEXT_PUBLIC_AGENCY_NAME']?.trim() || 'Your Agency';
const APP_URL = appUrl();

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Index Joy — how visible is your brand across Google and AI?',
    template: '%s · Index Joy',
  },
  description:
    'Find out how visible your brand is across Google and AI answer engines — and what is stopping customers from finding you. Free audit across SEO, AEO and GEO.',
  openGraph: {
    type: 'website',
    siteName: 'Index Joy',
    title: 'How visible is your brand across Google and AI?',
    description:
      'A free audit of your SEO, answer-engine and generative-engine visibility, with the evidence behind every score.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#141413' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2"
          style={{ background: 'var(--surface-2)' }}
        >
          Skip to content
        </a>
        <div className="flex min-h-screen flex-col">
          <SiteHeader email={session?.user?.email ?? null} />
          <main id="main" className="flex-1">{children}</main>
          <SiteFooter agency={AGENCY} />
        </div>
      </body>
    </html>
  );
}

function SiteHeader({ email }: { email: string | null }) {
  return (
    <header
      className="no-print sticky top-0 z-40 border-b backdrop-blur-md"
      style={{ background: 'color-mix(in srgb, var(--surface-0) 82%, transparent)' }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark />
          <span>Index Joy</span>
        </a>
        <nav className="flex min-w-0 items-center gap-1 text-sm">
          <a
            href="/methodology"
            className="hidden rounded-md px-3 py-1.5 transition-colors hover:bg-[var(--surface-2)] sm:block"
            style={{ color: 'var(--text-secondary)' }}
          >
            Methodology
          </a>
          {email ? (
            <>
              <span
                className="hidden max-w-[180px] truncate px-2 text-xs md:block"
                style={{ color: 'var(--text-muted)' }}
                title={email}
              >
                {email}
              </span>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button
                  type="submit"
                  className="rounded-md px-3 py-1.5 transition-colors hover:bg-[var(--surface-2)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <a
              href="/signin"
              className="rounded-md px-3 py-1.5 font-medium transition-colors"
              style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)' }}
            >
              Sign in
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="var(--accent)" strokeWidth="2" />
      <path d="M13.5 13.5 L18 18" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="9" r="2" fill="var(--accent)" />
    </svg>
  );
}

function SiteFooter({ agency }: { agency: string }) {
  return (
    <footer className="no-print border-t" style={{ background: 'var(--surface-1)' }}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 font-semibold"><LogoMark /> Index Joy</div>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Visibility measurement across search and AI answer engines. Every score traces to
              evidence you can check yourself.
            </p>
          </div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>What we don&apos;t do</p>
            <p className="mt-2 max-w-xs">
              We never report a &ldquo;ChatGPT ranking&rdquo;. No API exposes what the ChatGPT app
              shows a user, so any such number would be invented.{' '}
              <a href="/methodology#limitations" className="underline underline-offset-2">Read why</a>.
            </p>
          </div>
        </div>
        <div
          className="mt-8 border-t pt-6 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          A visibility intelligence product by {agency}.
        </div>
      </div>
    </footer>
  );
}
