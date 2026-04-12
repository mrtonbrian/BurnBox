export interface Env {
  DB: D1Database;
  NOTES_KV: KVNamespace;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
}
