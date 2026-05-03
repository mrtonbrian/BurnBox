/**
 * Shared types between frontend and worker.
 */

export interface NoteFile {
  name: string;
  size: number;
  mime_type: string;
}

export interface NoteContent {
  body: string;
  files: NoteFile[];
}

export interface CreateNoteRequest {
  note_content: string;
  expires_at?: number;
  max_views?: number;
  file_count?: number;
}

export type NoteMetadataResponse =
  | { has_password: false }
  | { has_password: true; password_salt: string };

export interface GetNoteResponse {
  note_content: string;
  file_count: number;
}

export interface FinalizeNoteRequest {
  password_hash?: string;
}

export interface CreateNoteResponse {
  id: string;
}
