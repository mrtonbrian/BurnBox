import { encryptBytes } from "@shared/crypto.js";
import { uploadFile } from "./api.js";

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * Encrypt a file with the DEK and upload its ciphertext to the worker.
 * Reports progress on the upload phase only (encryption is fast for ≤100MB).
 */
export async function encryptAndUpload(
  id: string,
  index: number,
  file: File,
  dek: string,
  onProgress: (p: UploadProgress) => void,
): Promise<void> {
  const buffer = await file.arrayBuffer();
  const encrypted = await encryptBytes(buffer, dek);

  await uploadFile(id, index, encrypted, (loaded, total) => {
    onProgress({ loaded, total });
  });
}
