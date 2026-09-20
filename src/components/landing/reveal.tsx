'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reveals a section as it scrolls into view.
 *
 * Starts *visible* and only hides once JavaScript confirms it can observe and
 * animate. A section parked at opacity 0 waiting for an observer is invisible
 * to anyone whose JS fails and to anything that screenshots the page.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced || typeof IntersectionObserver === 'undefined') return;

    const node = ref.current;
    if (!node) return;

    // Anything already on screen at load stays put — no flash of hidden content.
    const onScreen = node.getBoundingClientRect().top < window.innerHeight * 0.9;
    if (onScreen) return;

    setArmed(true);
    setShown(false);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        armed
          ? {
              opacity: shown ? 1 : 0,
              transform: shown ? 'none' : 'translateY(14px)',
              transition: `opacity .55s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .55s cubic-bezier(.22,1,.36,1) ${delay}ms`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
