import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { recordSignIn } from '@/lib/sheets';

/**
 * Google sign-in.
 *
 * Sessions are JWTs, so there is no session table to maintain and no database
 * round trip on every request. Identity is the only thing we need from auth —
 * the audit history lives in Postgres keyed by email.
 *
 * Deliberately no middleware: this module pulls in the Google Sheets client,
 * which needs Node crypto and would fail on the Edge runtime. Protection
 * happens in server components and route handlers instead, which is a shorter
 * path to the same guarantee.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: '/signin', error: '/signin' },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // Fire and forget: the sheet is a reporting surface, never a gate. If
      // logging fails, the person still signs in and Postgres still records
      // everything, so the row can be backfilled.
      void recordSignIn({ email: user.email, name: user.name }).catch(() => undefined);
      return true;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
