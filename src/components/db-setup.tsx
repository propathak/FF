'use client';

import { useState } from 'react';
import { Button, Card } from './ui/primitives';

/**
 * One-click schema setup.
 *
 * Exists because the alternative — find your provider's SQL editor, copy a
 * 300-line file out of GitHub, paste it in — is the fiddliest step in the
 * whole deployment and the easiest to half-finish.
 */
export function DbSetup({ connected }: { connected: boolean }) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState('running');
    setMessage(null);
    try {
      const response = await fetch('/api/admin/migrate', { method: 'POST' });
      const data = (await response.json()) as {
        ok?: boolean; tableCount?: number; error?: string; hint?: string;
      };
      if (!response.ok || !data.ok) {
        setState('error');
        setMessage([data.error, data.hint].filter(Boolean).join(' '));
        return;
      }
      setState('done');
      setMessage(`Created ${data.tableCount} tables.`);
      // Reload so the page renders the real dashboard.
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setState('error');
      setMessage('The request failed. Check the deployment logs.');
    }
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold">Set up the database</h1>
      {connected ? (
        <>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            A database is connected, but the tables have not been created yet. This applies the
            schema — it only adds tables and indexes, never removes anything, and running it again
            later is a no-op.
          </p>
          <Button className="mt-5" onClick={run} disabled={state === 'running' || state === 'done'}>
            {state === 'running' ? 'Creating tables…' : state === 'done' ? 'Done' : 'Create the tables'}
          </Button>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          No database is connected. Add one in Vercel under <strong>Storage</strong>, which sets{' '}
          <code>DATABASE_URL</code> automatically, then redeploy and come back here.
        </p>
      )}

      {message && (
        <p
          className="mt-4 rounded-lg px-3 py-2 text-sm"
          role="status"
          style={{
            background: state === 'error' ? 'var(--status-critical-soft)' : 'var(--status-good-soft)',
            color: state === 'error' ? 'var(--status-critical)' : 'var(--status-good)',
          }}
        >
          {message}
        </p>
      )}

      <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        The equivalent from a terminal is <code>npm run db:migrate</code>.
      </p>
    </Card>
  );
}
