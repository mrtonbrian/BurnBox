import { describe, it, expect } from "vitest";
import {
  generateDEK,
  wrapDEK,
  unwrapDEK,
  encrypt,
  decrypt,
  encryptBytes,
  decryptBytes,
  derivePasswordHash,
  extractPasswordSalt,
  recomputePasswordHash,
  fromBase64Url,
} from "../src/shared/crypto.js";
import { comparePasswordHash } from "../src/worker/crypto.js";
import { KEY_LENGTH_BYTES, IV_LENGTH_BYTES } from "../src/shared/constants.js";

describe("generateDEK", () => {
  it("returns a base64url string of the correct length", async () => {
    const dek = await generateDEK();
    const bytes = fromBase64Url(dek);
    expect(bytes.length).toBe(KEY_LENGTH_BYTES);
  });

  it("generates unique keys", async () => {
    const a = await generateDEK();
    const b = await generateDEK();
    expect(a).not.toBe(b);
  });
});

describe("encrypt / decrypt", () => {
  it("round-trips plaintext", async () => {
    const dek = await generateDEK();
    const plaintext = "hello burnbox";
    const ciphertext = await encrypt(plaintext, dek);
    const result = await decrypt(ciphertext, dek);
    expect(result).toBe(plaintext);
  });

  it("output has iv prefix", async () => {
    const dek = await generateDEK();
    const ciphertext = await encrypt("test", dek);
    const bytes = fromBase64Url(ciphertext);
    // iv (12) + ciphertext (>0)
    expect(bytes.length).toBeGreaterThan(IV_LENGTH_BYTES);
  });

  it("different encryptions produce different ciphertext", async () => {
    const dek = await generateDEK();
    const a = await encrypt("same", dek);
    const b = await encrypt("same", dek);
    expect(a).not.toBe(b); // random IV
  });

  it("throws on wrong key", async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    const ciphertext = await encrypt("secret", dek1);
    await expect(decrypt(ciphertext, dek2)).rejects.toThrow();
  });

  it("handles empty string", async () => {
    const dek = await generateDEK();
    const ciphertext = await encrypt("", dek);
    const result = await decrypt(ciphertext, dek);
    expect(result).toBe("");
  });

  it("handles unicode", async () => {
    const dek = await generateDEK();
    const plaintext = "🔥 日本語 العربية";
    const ciphertext = await encrypt(plaintext, dek);
    const result = await decrypt(ciphertext, dek);
    expect(result).toBe(plaintext);
  });
});

describe("encryptBytes / decryptBytes", () => {
  it("round-trips binary data", async () => {
    const dek = await generateDEK();
    const original = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const encrypted = await encryptBytes(original.buffer as ArrayBuffer, dek);
    const decrypted = await decryptBytes(encrypted.buffer as ArrayBuffer, dek);
    expect(new Uint8Array(decrypted)).toEqual(original);
  });

  it("handles large payloads", async () => {
    const dek = await generateDEK();
    const original = new Uint8Array(1024 * 1024); // 1MB
    for (let i = 0; i < original.length; i += 65536) {
      crypto.getRandomValues(original.subarray(i, i + 65536));
    }
    const encrypted = await encryptBytes(original.buffer as ArrayBuffer, dek);
    const decrypted = await decryptBytes(encrypted.buffer as ArrayBuffer, dek);
    expect(new Uint8Array(decrypted)).toEqual(original);
  });

  it("throws on wrong key", async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    const encrypted = await encryptBytes(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer, dek1);
    await expect(decryptBytes(encrypted.buffer as ArrayBuffer, dek2)).rejects.toThrow();
  });
});

describe("wrapDEK / unwrapDEK", () => {
  it("round-trips with correct password", async () => {
    const dek = await generateDEK();
    const wrapped = await wrapDEK(dek, "password123");
    const unwrapped = await unwrapDEK(wrapped, "password123");
    expect(unwrapped).toBe(dek);
  });

  it("throws on wrong password", async () => {
    const dek = await generateDEK();
    const wrapped = await wrapDEK(dek, "correct");
    await expect(unwrapDEK(wrapped, "wrong")).rejects.toThrow();
  });

  it("wrapped output is longer than raw DEK (salt + wrap overhead)", async () => {
    const dek = await generateDEK();
    const wrapped = await wrapDEK(dek, "pass");
    const wrappedBytes = fromBase64Url(wrapped);
    const dekBytes = fromBase64Url(dek);
    // 16 bytes salt + 24 bytes wrapped (16 byte key + 8 byte AES-KW overhead)
    expect(wrappedBytes.length).toBe(16 + dekBytes.length + 8);
  });

  it("different wraps produce different output (random salt)", async () => {
    const dek = await generateDEK();
    const a = await wrapDEK(dek, "pass");
    const b = await wrapDEK(dek, "pass");
    expect(a).not.toBe(b);
  });
});

describe("full flow: wrap + encrypt", () => {
  it("encrypt with DEK, wrap DEK, unwrap, decrypt", async () => {
    const password = "hunter2";
    const plaintext = "this is a secret note";

    // Sender
    const dek = await generateDEK();
    const ciphertext = await encrypt(plaintext, dek);
    const wrappedDEK = await wrapDEK(dek, password);

    // Recipient (has wrappedDEK from URL fragment + password)
    const recoveredDEK = await unwrapDEK(wrappedDEK, password);
    const result = await decrypt(ciphertext, recoveredDEK);

    expect(result).toBe(plaintext);
  });

  it("fails without password (cannot decrypt with wrapped DEK directly)", async () => {
    const dek = await generateDEK();
    const ciphertext = await encrypt("secret", dek);
    const wrappedDEK = await wrapDEK(dek, "password");

    // Trying to use wrappedDEK as a DEK should fail
    await expect(decrypt(ciphertext, wrappedDEK)).rejects.toThrow();
  });
});

describe("derivePasswordHash", () => {
  it("produces v1:salt:hash format", async () => {
    const hash = await derivePasswordHash("password");
    const parts = hash.split(":");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("v1");
  });

  it("different calls produce different hashes (random salt)", async () => {
    const a = await derivePasswordHash("password");
    const b = await derivePasswordHash("password");
    expect(a).not.toBe(b);
  });

  it("different passwords produce different hashes", async () => {
    const a = await derivePasswordHash("password1");
    const b = await derivePasswordHash("password2");
    const hashA = a.split(":")[2];
    const hashB = b.split(":")[2];
    expect(hashA).not.toBe(hashB);
  });
});

describe("extractPasswordSalt", () => {
  it("extracts version:salt prefix", async () => {
    const hash = await derivePasswordHash("test");
    const salt = extractPasswordSalt(hash);
    expect(salt).not.toBeNull();
    expect(salt!.startsWith("v1:")).toBe(true);
    expect(salt!.split(":").length).toBe(2);
  });

  it("returns null for malformed input", () => {
    expect(extractPasswordSalt("garbage")).toBeNull();
    expect(extractPasswordSalt("v1:onlytwoParts")).toBeNull();
  });
});

describe("recomputePasswordHash", () => {
  it("recomputes the same hash given the same password and salt", async () => {
    const original = await derivePasswordHash("mypassword");
    const saltPrefix = extractPasswordSalt(original)!;
    const recomputed = await recomputePasswordHash("mypassword", saltPrefix);
    expect(recomputed).toBe(original);
  });

  it("produces different hash for wrong password", async () => {
    const original = await derivePasswordHash("correct");
    const saltPrefix = extractPasswordSalt(original)!;
    const wrong = await recomputePasswordHash("wrong", saltPrefix);
    expect(wrong).not.toBe(original);
  });

  it("throws on invalid salt prefix", async () => {
    await expect(recomputePasswordHash("pass", "")).rejects.toThrow();
  });

  it("throws on unknown version", async () => {
    await expect(recomputePasswordHash("pass", "v99:abc")).rejects.toThrow("Unknown hash version");
  });
});

describe("comparePasswordHash (server-side)", () => {
  it("returns true for matching hashes", async () => {
    const hash = await derivePasswordHash("password");
    const saltPrefix = extractPasswordSalt(hash)!;
    const recomputed = await recomputePasswordHash("password", saltPrefix);
    expect(comparePasswordHash(recomputed, hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await derivePasswordHash("correct");
    const saltPrefix = extractPasswordSalt(hash)!;
    const wrong = await recomputePasswordHash("wrong", saltPrefix);
    expect(comparePasswordHash(wrong, hash)).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(comparePasswordHash("short", "muchlongerstring")).toBe(false);
  });
});
