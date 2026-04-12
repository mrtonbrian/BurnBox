export const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
export const NOTE_CREATION_TIMEOUT_SECONDS = 10 * 60; // 10 minutes
export const VIEW_GRACE_PERIOD_SECONDS = 30 * 60; // 30 minutes after last view to download files
export const MAX_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const PBKDF2_ITERATIONS = 600_000; // https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
export const KEY_LENGTH_BYTES = 16; // 128-bit AES key
export const IV_LENGTH_BYTES = 12; // 96-bit IV for AES-GCM
