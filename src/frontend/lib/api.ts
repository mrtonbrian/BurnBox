import type {
  CreateNoteRequest,
  CreateNoteResponse,
  FinalizeNoteRequest,
  GetNoteResponse,
  NoteMetadataResponse,
} from "@shared/types.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handle(res: Response): Promise<unknown> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res;
}

export async function createNote(body: CreateNoteRequest): Promise<CreateNoteResponse> {
  const res = await fetch("/api/note", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle(res) as Promise<CreateNoteResponse>;
}

export async function uploadFile(
  id: string,
  index: number,
  bytes: Uint8Array,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/note/${id}/file/${index}`);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(bytes.byteLength, bytes.byteLength);
        resolve();
      } else {
        reject(new ApiError(xhr.status, xhr.responseText || xhr.statusText));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.send(bytes as BodyInit as XMLHttpRequestBodyInit);
  });
}

export async function finalizeNote(id: string, body: FinalizeNoteRequest): Promise<void> {
  const res = await fetch(`/api/note/${id}/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  await handle(res);
}

export async function getNoteMeta(id: string): Promise<NoteMetadataResponse> {
  const res = await fetch(`/api/note/${id}/meta`);
  return handle(res) as Promise<NoteMetadataResponse>;
}

export async function getNote(id: string, passwordHash?: string): Promise<GetNoteResponse> {
  const headers: Record<string, string> = {};
  if (passwordHash) headers["X-Password-Hash"] = passwordHash;
  const res = await fetch(`/api/note/${id}`, { headers });
  return handle(res) as Promise<GetNoteResponse>;
}

export async function downloadFile(id: string, index: number): Promise<ArrayBuffer> {
  const res = await fetch(`/api/note/${id}/file/${index}`);
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.arrayBuffer();
}
