/**
 * Recognising a bot-protection interstitial.
 *
 * The distinction this draws is the difference between an honest report and a
 * fabricated one, and between a fabricated one and no report at all:
 *
 *   - A site behind a challenge returns HTTP 200 with a page that is not the
 *     site. Scoring it would invent a verdict about content nobody saw.
 *   - A client-side-rendered site also returns HTTP 200 with almost no text --
 *     but that IS the site, and it is the single most damaging thing that can
 *     be true of a site's AI visibility. Refusing to report it throws away the
 *     most valuable finding the audit has.
 *
 * Both look identical on a word count, which is why they were treated the
 * same and both refused. These are vendor fingerprints rather than
 * heuristics, because a false positive here silently withholds a real report.
 */

const MARKERS: Array<{ vendor: string; pattern: RegExp }> = [
  // Cloudflare: managed challenge, JS challenge, and the 1020 block page.
  { vendor: 'Cloudflare', pattern: /cf-browser-verification|__cf_chl|cf_chl_opt|\/cdn-cgi\/challenge-platform/i },
  { vendor: 'Cloudflare', pattern: /<title>\s*(just a moment|attention required!)/i },
  // Imperva / Incapsula.
  { vendor: 'Imperva', pattern: /_Incapsula_Resource|Incapsula incident ID|\/_Incapsula_/i },
  // Akamai Bot Manager.
  { vendor: 'Akamai', pattern: /Reference&#32;#\d|errors\.edgesuite\.net|akamai-bot-manager/i },
  // Sucuri WAF.
  { vendor: 'Sucuri', pattern: /sucuri_cloudproxy|Sucuri Website Firewall/i },
  // PerimeterX / HUMAN.
  { vendor: 'PerimeterX', pattern: /_pxhd|px-captcha|perimeterx/i },
  // DataDome.
  { vendor: 'DataDome', pattern: /datadome|geo\.captcha-delivery\.com/i },
  // Generic interstitials that are never a real page.
  { vendor: 'bot protection', pattern: /enable javascript and cookies to continue/i },
  { vendor: 'bot protection', pattern: /<title>[^<]*(access denied|verify you are (a )?human|are you a robot)/i },
];

export interface ChallengeVerdict {
  isChallenge: boolean;
  vendor: string | null;
}

export function detectBotChallenge(html: string | null | undefined): ChallengeVerdict {
  if (!html) return { isChallenge: false, vendor: null };
  // Only the head and the opening of the body are inspected. A challenge page
  // is small and declares itself early, whereas a long real page could
  // coincidentally mention a vendor name in its own copy.
  const head = html.slice(0, 20_000);
  for (const { vendor, pattern } of MARKERS) {
    if (pattern.test(head)) return { isChallenge: true, vendor };
  }
  return { isChallenge: false, vendor: null };
}
