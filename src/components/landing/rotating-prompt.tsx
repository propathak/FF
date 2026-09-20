'use client';

import { useEffect, useState } from 'react';
import { BUYER_PROMPTS } from './showcase-checks';

/**
 * Cycles the kind of prompt a buyer actually types into an AI assistant.
 *
 * The hook is that the question is always being asked — the only variable is
 * whether the brand is in the answer. Concrete prompts do that work; an
 * abstract claim about "AI visibility" does not.
 */
export function RotatingPrompt() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % BUYER_PROMPTS.length);
        setVisible(true);
      }, 280);
    }, 2900);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="inline-flex items-baseline"
      // The live region announces each prompt once rather than on every frame.
      aria-live="polite"
    >
      <span
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'none' : 'translateY(-4px)',
          transition: 'opacity .28s ease, transform .28s ease',
          color: 'var(--text-primary)',
          fontWeight: 560,
        }}
      >
        &ldquo;{BUYER_PROMPTS[index]}&rdquo;
      </span>
    </span>
  );
}
