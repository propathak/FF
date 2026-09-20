import { ImageResponse } from 'next/og';

export const alt = 'Index Joy — how visible is your brand across Google and AI?';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Social card. A shared report is a distribution channel, so a link that
 * previews as a blank rectangle is a wasted impression.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0b0b0b',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: '5px solid #3987e5',
              display: 'flex',
            }}
          />
          <span style={{ color: '#ffffff', fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
            Index Joy
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              color: '#ffffff',
              fontSize: 62,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: -1.8,
              maxWidth: 940,
            }}
          >
            How visible is your brand across Google and AI?
          </span>
          <span style={{ color: '#a3a29b', fontSize: 27, marginTop: 26, maxWidth: 880 }}>
            A free audit across SEO, AEO and GEO — with the evidence behind every score.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {['SEO', 'AEO', 'GEO', 'AI visibility'].map((label) => (
            <span
              key={label}
              style={{
                color: '#c3c2b7',
                fontSize: 21,
                border: '1px solid #32322e',
                borderRadius: 999,
                padding: '8px 20px',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
