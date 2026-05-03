import { PBKDF2_ITERATIONS, KEY_LENGTH_BYTES, IV_LENGTH_BYTES } from "./constants.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PASSWORD_HASH_VERSION = "v1";
const PASSWORD_HASH_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;

/**
 * Generate a random AES-128 Data Encryption Key.
 * @returns base64url-encoded DEK for use in the URL fragment
 */
export async function generateDEK(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: KEY_LENGTH_BYTES * 8 },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = (await crypto.subtle.exportKey("raw", key as CryptoKey)) as ArrayBuffer;
  return toBase64Url(new Uint8Array(raw));
}

/**
 * Wrap a DEK with a password-derived KEK via AES-KW.
 *
 * The URL fragment becomes the wrapped output instead of the raw DEK.
 * Without the password, the DEK cannot be recovered.
 *
 * @param dek - base64url-encoded DEK from {@link generateDEK}
 * @param password - user-provided password
 * @returns base64url(pbkdf2_salt + aes_kw_wrapped_key)
 */
export async function wrapDEK(dek: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const kek = await deriveKEK(password, salt);

  const dekKey = await crypto.subtle.importKey("raw", fromBase64Url(dek), "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);

  const wrapped = (await crypto.subtle.wrapKey("raw", dekKey, kek, "AES-KW")) as ArrayBuffer;

  const result = new Uint8Array(SALT_LENGTH_BYTES + wrapped.byteLength);
  result.set(salt);
  result.set(new Uint8Array(wrapped), SALT_LENGTH_BYTES);
  return toBase64Url(result);
}

/**
 * Unwrap a DEK using a password-derived KEK.
 *
 * @param wrappedDEK - output from {@link wrapDEK}
 * @param password - user-provided password
 * @returns base64url-encoded DEK
 * @throws {DOMException} if the password is incorrect (AES-KW integrity check fails)
 */
export async function unwrapDEK(wrappedDEK: string, password: string): Promise<string> {
  const data = fromBase64Url(wrappedDEK);
  const salt = data.slice(0, SALT_LENGTH_BYTES);
  const wrapped = data.slice(SALT_LENGTH_BYTES);

  const kek = await deriveKEK(password, salt);

  const dekKey = await crypto.subtle.unwrapKey("raw", wrapped, kek, "AES-KW", "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);

  const exported = (await crypto.subtle.exportKey("raw", dekKey)) as ArrayBuffer;
  return toBase64Url(new Uint8Array(exported));
}

async function deriveKEK(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(encoder.encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-KW", length: KEY_LENGTH_BYTES * 8 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

// --- Password hashing (used by both client and server) ---

/**
 * Derive a password hash for server-side storage via PBKDF2.
 *
 * The hash format is versioned (`v1:salt:hash`) to allow future algorithm changes
 * without breaking existing notes.
 *
 * @param password - user-provided password
 * @returns versioned hash string `"v1:<base64url_salt>:<base64url_hash>"`
 */
export async function derivePasswordHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const hash = await pbkdf2V1(password, salt);
  return `${PASSWORD_HASH_VERSION}:${toBase64Url(salt)}:${toBase64Url(new Uint8Array(hash))}`;
}

/**
 * Extract the version and salt prefix from a stored password hash.
 * Returned to the client via `/api/note/:id/meta` so it can recompute the hash.
 *
 * @param storedHash - hash from {@link derivePasswordHash}
 * @returns `"v1:<base64url_salt>"` or `null` if malformed
 */
export function extractPasswordSalt(storedHash: string): string | null {
  const parts = storedHash.split(":");
  if (parts.length < 3) return null;
  return `${parts[0]}:${parts[1]}`;
}

/**
 * Recompute a password hash from the password and the salt prefix returned by `/meta`.
 * The result is sent to the server in the `X-Password-Hash` header for authentication.
 *
 * @param password - user-provided password
 * @param saltPrefix - `"v1:<base64url_salt>"` from {@link extractPasswordSalt}
 * @returns full hash string matching the format from {@link derivePasswordHash}
 * @throws {Error} if the salt prefix is invalid or the version is unknown
 */
export async function recomputePasswordHash(password: string, saltPrefix: string): Promise<string> {
  const [version, saltStr] = saltPrefix.split(":");
  if (!version || !saltStr) throw new Error("Invalid salt prefix");

  const salt = fromBase64Url(saltStr);

  switch (version) {
    case "v1": {
      const hash = await pbkdf2V1(password, salt);
      return `${version}:${saltStr}:${toBase64Url(new Uint8Array(hash))}`;
    }
    default:
      throw new Error(`Unknown hash version: ${version}`);
  }
}

async function pbkdf2V1(password: string, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(encoder.encode(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    PASSWORD_HASH_LENGTH_BITS,
  );
}

async function importDEK(dek: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64Url(dek), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt a plaintext string with AES-128-GCM.
 *
 * @param plaintext - UTF-8 string to encrypt
 * @param dek - base64url-encoded DEK from {@link generateDEK} or {@link unwrapDEK}
 * @returns base64url(iv + ciphertext + auth_tag)
 */
export async function encrypt(plaintext: string, dek: string): Promise<string> {
  const key = await importDEK(dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new Uint8Array(encoder.encode(plaintext)),
  );

  const result = new Uint8Array(IV_LENGTH_BYTES + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), IV_LENGTH_BYTES);

  return toBase64Url(result);
}

/**
 * Decrypt a base64url-encoded ciphertext back to a plaintext string.
 *
 * @param encoded - output from {@link encrypt}
 * @param dek - base64url-encoded DEK
 * @returns original plaintext
 * @throws {DOMException} if the key is wrong (AES-GCM auth tag check fails)
 */
export async function decrypt(encoded: string, dek: string): Promise<string> {
  const data = fromBase64Url(encoded);

  const iv = data.slice(0, IV_LENGTH_BYTES);
  const ciphertext = data.slice(IV_LENGTH_BYTES);

  const key = await importDEK(dek);

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

  return decoder.decode(plaintext);
}

/**
 * Encrypt raw bytes with AES-128-GCM (for file encryption).
 *
 * @param data - raw bytes to encrypt
 * @param dek - base64url-encoded DEK
 * @returns iv + ciphertext + auth_tag as Uint8Array
 */
export async function encryptBytes(data: ArrayBuffer, dek: string): Promise<Uint8Array> {
  const key = await importDEK(dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

  const result = new Uint8Array(IV_LENGTH_BYTES + ciphertext.byteLength);
  result.set(iv);
  result.set(new Uint8Array(ciphertext), IV_LENGTH_BYTES);

  return result;
}

/**
 * Decrypt raw bytes (for file decryption).
 *
 * @param data - output from {@link encryptBytes}
 * @param dek - base64url-encoded DEK
 * @returns original bytes
 * @throws {DOMException} if the key is wrong (AES-GCM auth tag check fails)
 */
export async function decryptBytes(data: ArrayBuffer, dek: string): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(data);

  const iv = bytes.slice(0, IV_LENGTH_BYTES);
  const ciphertext = bytes.slice(IV_LENGTH_BYTES);

  const key = await importDEK(dek);

  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

// --- Base64url helpers ---

// https://thewoods.blog/base64url/
export function toBase64Url(bytes: Uint8Array): string {
  return btoa(
    Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join(""),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const m = str.length % 4;
  const b64 = str
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(str.length + ((4 - m) % 4), "=");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
