/**
 * Worker-only crypto helpers. Anything in here uses APIs that exist on
 * Cloudflare Workers / Node 20+ but not in the browser DOM lib.
 */

// timingSafeEqual is available on Cloudflare Workers' SubtleCrypto but the
// DOM lib doesn't know about it. Augment the global type so call sites
// typecheck cleanly.
declare global {
  interface SubtleCrypto {
    timingSafeEqual(a: BufferSource, b: BufferSource): boolean;
  }
}

const encoder = new TextEncoder();

/**
 * Timing-safe comparison of two password hash strings.
 * Prevents timing attacks that could leak hash validity through response time.
 *
 * Requires `crypto.subtle.timingSafeEqual` (Cloudflare Workers / Node 20+).
 *
 * @param providedHash - hash from the client's `X-Password-Hash` header
 * @param storedHash - hash from the database
 * @returns `true` if the hashes match
 */
export function comparePasswordHash(providedHash: string, storedHash: string): boolean {
  const a = encoder.encode(providedHash);
  const b = encoder.encode(storedHash);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}
