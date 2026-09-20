'use client';

import { useEffect, useState } from 'react';
import type { StatusTone } from './primitives';
import { TONE_COLOR, toneForScore } from '@/lib/tone';

export { toneForScore };

/**
 * Score ring.
 *
 * A single headline number with a magnitude ring behind it. The ring uses the
 * status palette (good / warning / serious / critical) rather than a categorical
 * hue, because the colour here encodes *state*, not identity — and the band
 * label beside it means the colour never carries the meaning alone.
 */

export function ScoreRing({
  score,
  size = 120,
  label,
  sublabel,
  animate = true,
}: {
  /** null renders an explicit "insufficient data" state instead of a zero. */
  score: number | null;
  size?: number;
  label?: string;
  sublabel?: string;
  animate?: boolean;
}) {
  const [shown, setShown] = useState(animate ? 0 : (score ?? 0));

  useEffect(() => {
    if (!animate || score === null) {
      setShown(score ?? 0);
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(score);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      setShown(Math.round(score * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, animate]);

  const stroke = Math.max(6, Math.round(size * 0.075));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const unmeasured = score === null;
  const color = unmeasured ? 'var(--text-muted)' : TONE_COLOR[toneForScore(score)];
  const offset = circumference * (1 - (unmeasured ? 0 : shown / 100));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="var(--surface-3)" strokeWidth={stroke}
          />
          {!unmeasured && (
            <circle
              cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke={color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 120ms linear' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {unmeasured ? (
            <span
              className="px-2 text-center text-[11px] leading-tight"
              style={{ color: 'var(--text-muted)', fontSize: size < 90 ? 9 : 11 }}
            >
              Insufficient data
            </span>
          ) : (
            <>
              <span
                className="font-semibold tabular-nums tracking-tight"
                style={{ fontSize: size * 0.3, lineHeight: 1 }}
              >
                {shown}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: size * 0.1 }}>/100</span>
            </>
          )}
        </div>
      </div>
      {label && <p className="text-sm font-medium">{label}</p>}
      {sublabel && (
        <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>{sublabel}</p>
      )}
      {/* Screen readers get the number without decoding the ring. */}
      <span className="sr-only">
        {label ?? 'Score'}: {unmeasured ? 'insufficient data to report a score' : `${score} out of 100`}
      </span>
    </div>
  );
}

export function ScoreBar({
  value, max = 100, tone, showValue = true, height = 8,
}: {
  value: number;
  max?: number;
  tone?: StatusTone;
  showValue?: boolean;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = TONE_COLOR[tone ?? toneForScore(value)];
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--surface-3)', height }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {showValue && (
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums">{Math.round(value)}</span>
      )}
    </div>
  );
}
