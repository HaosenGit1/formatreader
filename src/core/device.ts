/**
 * What kind of device the page runs on, and roughly how much memory a tab may use there.
 * Kept tiny: it is part of the first page load. The thresholds that use it live in limits.ts.
 *
 * For testing, the address can pretend: ?device=phone|tablet|desktop and ?mem=2 (GB).
 */
export type DeviceKind = 'phone' | 'tablet' | 'desktop';
/** low: a phone, or very little memory · mid: tablets, small laptops · high: computers. */
export type Tier = 'low' | 'mid' | 'high';

export interface Device {
  kind: DeviceKind;
  /** Device memory in GB when the browser tells (Chrome, Edge, Android); otherwise null. */
  memoryGB: number | null;
  tier: Tier;
}

let cached: Device | null = null;

function override(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

function kindOf(): DeviceKind {
  const forced = override('device');
  if (forced === 'phone' || forced === 'tablet' || forced === 'desktop') return forced;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const ua = nav.userAgent;
  // iPadOS reports itself as a Mac: a "Mac" with a touch screen is an iPad.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return 'tablet';
  if (/iPhone|iPod|Windows Phone|Mobi/i.test(ua) || nav.userAgentData?.mobile) return 'phone';
  if (/Android/i.test(ua)) return 'tablet'; // Android without "Mobile" is a tablet
  // Touch-only devices with a small screen (unknown browsers) are treated as phones.
  const small = Math.min(screen.width, screen.height) < 600;
  return small && nav.maxTouchPoints > 0 ? 'phone' : 'desktop';
}

export function device(): Device {
  if (cached) return cached;
  const kind = kindOf();
  const forcedMem = Number(override('mem'));
  const reported = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const memoryGB = forcedMem > 0 ? forcedMem : typeof reported === 'number' ? reported : null;
  // Safari and Firefox don't tell the memory: judge by the kind of device. iPhones and iPads
  // close a tab at about 1–2 GB whatever the phone has, so they are never "high".
  let tier: Tier = kind === 'phone' ? 'low' : kind === 'tablet' ? 'mid' : 'high';
  if (memoryGB !== null) {
    if (memoryGB <= 2) tier = 'low';
    else if (memoryGB <= 4 && tier === 'high') tier = 'mid';
    else if (memoryGB >= 8 && kind === 'phone' && !/iPhone/.test(navigator.userAgent)) tier = 'mid';
  }
  cached = { kind, memoryGB, tier };
  return cached;
}

/** Tests only: forget the cached answer (e.g. after changing ?device=). */
export function resetDevice(): void {
  cached = null;
}
