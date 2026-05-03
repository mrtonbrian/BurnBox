import { decryptBytes } from "@shared/crypto.js";
import { downloadFile } from "./api.js";

/**
 * Fetch encrypted file bytes from the worker, decrypt with the DEK,
 * and trigger a browser download with the original filename.
 */
export async function fetchDecryptAndSave(
  id: string,
  index: number,
  dek: string,
  filename: string,
  mimeType = "application/octet-stream",
): Promise<void> {
  const encrypted = await downloadFile(id, index);
  const decrypted = await decryptBytes(encrypted, dek);

  const blob = new Blob([decrypted], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
