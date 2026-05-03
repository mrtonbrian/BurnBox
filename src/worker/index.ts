import { AutoRouter, error } from "itty-router";
import { nanoid } from "nanoid";
import type { Env } from "./types.js";
import type {
  CreateNoteRequest,
  CreateNoteResponse,
  FinalizeNoteRequest,
  NoteMetadataResponse,
  GetNoteResponse,
} from "@shared/types.js";
import {
  MAX_TOTAL_SIZE,
  NOTE_CREATION_TIMEOUT_SECONDS,
  VIEW_GRACE_PERIOD_SECONDS,
  MAX_EXPIRY_SECONDS,
} from "@shared/constants.js";
import { extractPasswordSalt } from "@shared/crypto.js";
import { comparePasswordHash } from "./crypto.js";

const router = AutoRouter();

/**
 * Create a new note. Files are uploaded separately, and the password is set during finalization.
 * The flow is: create note (note_content, expires_at, max_views) -> upload files -> finalize note / uploads (password_hash).
 */
router.post("/api/note", async (request, env: Env) => {
  const body = await request.json<CreateNoteRequest>();

  if (!body.note_content) {
    return error(400, "Missing note_content");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = body.expires_at ? body.expires_at - now : MAX_EXPIRY_SECONDS;
  if (expiresIn <= 0 || expiresIn > MAX_EXPIRY_SECONDS) {
    return error(400, "expires_at must be within 30 days");
  }
  const expiresAt = now + expiresIn;

  const id = nanoid(12);

  await env.DB.prepare(
    `INSERT INTO notes (id, note_content, expires_at, file_count, max_views)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, body.note_content, expiresAt, body.file_count ?? 0, body.max_views ?? 1)
    .run();

  return { id } satisfies CreateNoteResponse;
});

/**
 * Upload a file to a note. Raw encrypted bytes in the request body.
 */
router.put("/api/note/:id/file/:index", async (request, env: Env) => {
  const { id, index: indexStr } = request.params;
  const size = Number(request.headers.get("content-length") ?? 0);
  if (!size) {
    return error(400, "Missing content-length");
  }

  // Check note exists and isn't finalized
  const note = await env.DB.prepare(
    "SELECT created_at, file_count, total_size, finalized_at FROM notes WHERE id = ?",
  )
    .bind(id)
    .first<{
      created_at: number;
      file_count: number;
      total_size: number;
      finalized_at: number | null;
    }>();

  if (!note) {
    return error(404, "Note not found");
  }
  if (note.finalized_at) {
    return error(400, "Note already finalized");
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - note.created_at;
  if (ageSeconds > NOTE_CREATION_TIMEOUT_SECONDS) {
    return error(410, "Upload window expired");
  }

  const index = Number(indexStr);
  if (index < 0 || index >= note.file_count) {
    return error(400, "Invalid file index");
  }

  const key = `${id}/${index}`;
  if (await env.BUCKET.head(key)) {
    return error(409, "File already uploaded at this index");
  }

  // Atomically check and update total_size
  const updated = await env.DB.prepare(
    "UPDATE notes SET total_size = total_size + ? WHERE id = ? AND total_size + ? <= ?",
  )
    .bind(size, id, size, MAX_TOTAL_SIZE)
    .run();

  if (!updated.meta.changes) {
    return error(413, "Total file size exceeds limit");
  }

  await env.BUCKET.put(key, request.body);

  return { ok: true };
});

/**
 * Finalize a note. Sets the password and marks the note as finalized.
 */
router.post("/api/note/:id/finalize", async (request, env: Env) => {
  const { id } = request.params;
  const note = await env.DB.prepare(
    "SELECT created_at, file_count, finalized_at FROM notes WHERE id = ?",
  )
    .bind(id)
    .first<{ created_at: number; file_count: number; finalized_at: number | null }>();

  if (!note) {
    return error(404, "Note not found");
  }

  if (note.finalized_at) {
    return error(400, "Note already finalized");
  }

  if (note.created_at + NOTE_CREATION_TIMEOUT_SECONDS < Math.floor(Date.now() / 1000)) {
    return error(410, "Creation window expired");
  }

  const body = await request.json<FinalizeNoteRequest>();

  await env.DB.prepare("UPDATE notes SET finalized_at = ?, password_hash = ? WHERE id = ?")
    .bind(Math.floor(Date.now() / 1000), body.password_hash ?? null, id)
    .run();
  return { ok: true };
});

/**
 * Check if a note exists and whether it requires a password.
 * Does not consume a view.
 */
router.get("/api/note/:id/meta", async (request, env: Env) => {
  const { id } = request.params;
  const now = Math.floor(Date.now() / 1000);

  const note = await env.DB.prepare(
    "SELECT password_hash, finalized_at, expires_at FROM notes WHERE id = ? AND deleted_at IS NULL AND view_count < max_views",
  )
    .bind(id)
    .first<{ password_hash: string | null; finalized_at: number | null; expires_at: number }>();

  if (!note || !note.finalized_at) {
    return error(404, "Note not found");
  }
  if (note.expires_at < now) {
    return error(410, "Note has expired");
  }

  if (note.password_hash) {
    const salt = extractPasswordSalt(note.password_hash);
    if (!salt) return error(500, "Corrupted password hash");
    return { has_password: true, password_salt: salt } satisfies NoteMetadataResponse;
  }
  return { has_password: false } satisfies NoteMetadataResponse;
});

/**
 * Open / read a note.
 * On final view: null out content and set deleted_at.
 * Cron cleans up R2 files after grace period for downloaded files.
 * Password hash sent via X-Password-Hash header.
 */
router.get("/api/note/:id", async (request, env: Env) => {
  const { id } = request.params;
  const now = Math.floor(Date.now() / 1000);

  const note = await env.DB.prepare(
    "SELECT note_content, file_count, password_hash, finalized_at, expires_at FROM notes WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(id)
    .first<{
      note_content: string;
      file_count: number;
      password_hash: string | null;
      finalized_at: number | null;
      expires_at: number;
    }>();

  if (!note || !note.finalized_at) {
    return error(404, "Note not found");
  }
  if (note.expires_at < now) {
    return error(410, "Note has expired");
  }

  if (note.password_hash) {
    const provided = request.headers.get("X-Password-Hash");
    if (!provided || !comparePasswordHash(provided, note.password_hash)) {
      return error(401, "Invalid password");
    }
  }

  // Atomically claim a view, delete content if at view limit
  const updated = await env.DB.prepare(
    `UPDATE notes SET
      view_count = view_count + 1,
      note_content = CASE WHEN view_count + 1 >= max_views THEN NULL ELSE note_content END,
      deleted_at = CASE WHEN view_count + 1 >= max_views THEN ? ELSE deleted_at END
    WHERE id = ? AND view_count < max_views`,
  )
    .bind(now, id)
    .run();

  if (!updated.meta.changes) {
    return error(410, "Note has reached its view limit");
  }

  return {
    note_content: note.note_content,
    file_count: note.file_count,
  } satisfies GetNoteResponse;
});

/**
 * Download a file from a note. Returns raw encrypted bytes.
 */
router.get("/api/note/:id/file/:index", async (request, env: Env) => {
  const { id, index } = request.params;

  const object = await env.BUCKET.get(`${id}/${index}`);
  if (!object) {
    return error(404, "File not found");
  }

  return new Response(object.body, {
    headers: { "content-type": "application/octet-stream" },
  });
});

/**
 * Path-based static asset routing for note IDs.
 * `/<id>` → serve view.html. Anything else falls through to the SPA
 * fallback (index.html) configured in wrangler.toml.
 */
const NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
router.get("/:id", async (request, env: Env) => {
  const id = request.params.id;
  if (!id || !NOTE_ID_PATTERN.test(id)) {
    return error(404);
  }
  const url = new URL(request.url);
  url.pathname = "/view.html";
  return env.ASSETS.fetch(new Request(url.toString()));
});

export default {
  fetch: router.fetch,

  /**
   * Cron job to cleanup expired and stale unfinalized notes.
   */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Mark expired and stale unfinalized notes as deleted
    await env.DB.prepare(
      `UPDATE notes SET deleted_at = ?, note_content = NULL WHERE deleted_at IS NULL AND (
        (finalized_at IS NULL AND created_at + ? < ?)
        OR (expires_at < ?)
      )`,
    )
      .bind(now, NOTE_CREATION_TIMEOUT_SECONDS, now, now)
      .run();

    // Clean up R2 files and remove rows past the grace period
    const deletedNotes = await env.DB.prepare(
      "SELECT id, file_count FROM notes WHERE deleted_at IS NOT NULL AND deleted_at + ? < ?",
    )
      .bind(VIEW_GRACE_PERIOD_SECONDS, now)
      .all<{ id: string; file_count: number }>();

    for (const note of deletedNotes.results) {
      if (note.file_count > 0) {
        const files = await env.BUCKET.list({ prefix: `${note.id}/` });
        await Promise.all(files.objects.map((obj) => env.BUCKET.delete(obj.key)));
      }
      await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(note.id).run();
    }
  },
} satisfies ExportedHandler<Env>;
