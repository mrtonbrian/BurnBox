/**
 * Read / write the URL fragment (after #) without sending it to the server.
 * The fragment carries either the raw DEK (no password) or the wrapped DEK
 * (with password). It MUST never appear in network requests.
 */

export function readFragment(): string {
  return location.hash.startsWith("#") ? location.hash.slice(1) : "";
}

export function writeFragment(value: string): void {
  history.replaceState(null, "", `#${value}`);
}

export function buildShareURL(id: string, key: string): string {
  return `${location.origin}/${id}#${key}`;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

export function parseShareURL(url: string): { id: string; key: string } | null {
  try {
    const u = new URL(url, location.origin);
    const id = u.pathname.replace(/^\//, "");
    if (!ID_PATTERN.test(id)) return null;
    const key = u.hash.startsWith("#") ? u.hash.slice(1) : "";
    if (!key) return null;
    return { id, key };
  } catch {
    return null;
  }
}

export function isValidNoteId(id: string): boolean {
  return ID_PATTERN.test(id);
}
