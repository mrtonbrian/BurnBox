/**
 * View page entry. Decrypts and renders the note from the URL fragment,
 * handling the password prompt, link-incomplete fallback, and burned state.
 */

import { decrypt, decryptBytes, unwrapDEK, recomputePasswordHash } from "@shared/crypto.js";
import type { NoteContent, NoteFile } from "@shared/types.js";
import { ApiError, getNoteMeta, getNote, downloadFile } from "./lib/api.js";
import { fetchDecryptAndSave, formatBytes } from "./lib/download.js";
import { readFragment, writeFragment, parseShareURL, isValidNoteId } from "./lib/url-fragment.js";
import { renderIcons, svgIcon } from "./components/icons.js";
import { mountPasswordPrompt } from "./components/password-prompt.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

const objectUrls: string[] = [];

function isInlineRenderable(mime: string): boolean {
  if (mime === "image/svg+xml") return false;
  return mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
}

const content = document.getElementById("content") as HTMLElement;

const noteId = location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");

interface ViewState {
  fragmentKey: string;
  ciphertext: { note_content: string; file_count: number } | null;
  passwordHash: string | undefined;
  password: string | undefined;
}

const state: ViewState = {
  fragmentKey: readFragment(),
  ciphertext: null,
  passwordHash: undefined,
  password: undefined,
};

if (!isValidNoteId(noteId)) {
  showStatus("Note not found", "This link does not look like a Burnbox note.");
} else {
  void start();
}

async function start(): Promise<void> {
  if (!state.fragmentKey) {
    showLinkIncomplete("Without the key in the URL fragment, this note can't be decrypted.");
    return;
  }

  let meta;
  try {
    meta = await getNoteMeta(noteId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      showStatus("Note not found", "This link has expired, been viewed, or never existed.");
    } else if (err instanceof ApiError && err.status === 410) {
      showStatus("Note has expired", "This note's expiry time has passed.");
    } else {
      showStatus("Couldn't reach server", err instanceof Error ? err.message : "Try again later.");
    }
    return;
  }

  showConfirm(meta);
}

function showConfirm(meta: { has_password: boolean; password_salt?: string }): void {
  const tpl = document.getElementById("t-confirm") as HTMLTemplateElement;
  const node = tpl.content.cloneNode(true) as DocumentFragment;
  const body = node.querySelector("[data-confirm-body]")!;
  const form = node.querySelector<HTMLFormElement>("[data-confirm-form]")!;

  body.textContent = "Opening it counts as one read of this note.";

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (meta.has_password && meta.password_salt) {
      showPasswordPrompt(meta.password_salt);
    } else {
      void fetchAndDecrypt();
    }
  });

  content.replaceChildren(node);
}

async function fetchAndDecrypt(): Promise<void> {
  showLoading();
  try {
    state.ciphertext = await getNote(noteId, state.passwordHash);
  } catch (err) {
    handleFetchError(err);
    return;
  }
  await tryDecryptAndRender();
}

function handleFetchError(err: unknown): void {
  if (err instanceof ApiError && err.status === 401) {
    showStatus("Wrong password", "");
  } else if (err instanceof ApiError && err.status === 410) {
    showStatus("Note has expired", "");
  } else if (err instanceof ApiError && err.status === 404) {
    showStatus("Note not found", "This link has expired, been viewed, or never existed.");
  } else {
    showStatus("Couldn't reach server", err instanceof Error ? err.message : "Try again later.");
  }
}

async function tryDecryptAndRender(): Promise<void> {
  if (!state.ciphertext) return;

  let dek: string;
  try {
    dek = state.password ? await unwrapDEK(state.fragmentKey, state.password) : state.fragmentKey;
  } catch {
    showLinkIncomplete(
      "This URL was modified or doesn't include the right key. Paste the full link to try again.",
    );
    return;
  }

  let plaintext: string;
  try {
    plaintext = await decrypt(state.ciphertext.note_content, dek);
  } catch {
    showLinkIncomplete(
      "This URL was modified or doesn't include the right key. Paste the full link to try again.",
    );
    return;
  }

  renderNote(plaintext, state.ciphertext.file_count, dek);
}

function renderNote(plaintext: string, fileCount: number, dek: string): void {
  let manifest: NoteContent;
  try {
    const parsed = JSON.parse(plaintext) as Partial<NoteContent>;
    if (typeof parsed.body !== "string" || !Array.isArray(parsed.files)) {
      throw new Error("Malformed manifest");
    }
    manifest = { body: parsed.body, files: parsed.files };
  } catch {
    showLinkIncomplete(
      "This URL was modified or doesn't include the right key. Paste the full link to try again.",
    );
    return;
  }

  const files = manifest.files.slice(0, fileCount);
  const body = manifest.body;

  const tpl = document.getElementById("t-note") as HTMLTemplateElement;
  const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;

  const noteBody = node.querySelector<HTMLElement>("[data-note-body]")!;
  const filesSection = node.querySelector<HTMLElement>("[data-files-section]")!;
  const filesLabel = node.querySelector<HTMLElement>("[data-files-label]")!;
  const filesListEl = node.querySelector<HTMLElement>("[data-files-list]")!;

  if (body.trim()) {
    const html = DOMPurify.sanitize(marked.parse(body, { async: false }) as string, {
      ADD_ATTR: ["target", "rel"],
    });
    noteBody.innerHTML = html;
    noteBody.hidden = false;
  }

  if (files.length > 0) {
    filesLabel.textContent = files.length === 1 ? "1 attachment" : `${files.length} attachments`;
    filesSection.hidden = false;

    files.forEach((file, idx) => {
      if (isInlineRenderable(file.mime_type)) {
        filesListEl.appendChild(renderInlineMedia(idx, dek, file));
      } else {
        filesListEl.appendChild(renderDownloadRow(idx, dek, file));
      }
    });
  }

  content.replaceChildren(node);
  renderIcons(content);
}

function renderInlineMedia(idx: number, dek: string, file: NoteFile): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "media-figure";

  let mediaEl: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  if (file.mime_type.startsWith("image/")) {
    mediaEl = document.createElement("img");
    (mediaEl as HTMLImageElement).alt = file.name;
    (mediaEl as HTMLImageElement).loading = "lazy";
  } else if (file.mime_type.startsWith("video/")) {
    mediaEl = document.createElement("video");
    mediaEl.controls = true;
    mediaEl.preload = "metadata";
  } else {
    mediaEl = document.createElement("audio");
    mediaEl.controls = true;
    mediaEl.preload = "metadata";
  }

  const caption = document.createElement("figcaption");
  caption.className = "media-figure__caption";
  caption.textContent = `${file.name} · ${formatBytes(file.size)}`;

  figure.appendChild(mediaEl);
  figure.appendChild(caption);

  void (async () => {
    try {
      const encrypted = await downloadFile(noteId, idx);
      const decrypted = await decryptBytes(encrypted, dek);
      const blob = new Blob([decrypted], { type: file.mime_type });
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      mediaEl.src = url;
    } catch {
      mediaEl.remove();
      caption.textContent = `${file.name} · failed to load`;
    }
  })();

  return figure;
}

function renderDownloadRow(idx: number, dek: string, file: NoteFile): HTMLElement {
  const tpl = document.getElementById("t-file-download-row") as HTMLTemplateElement;
  const row = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const nameEl = row.querySelector<HTMLElement>("[data-file-name]")!;
  const sizeEl = row.querySelector<HTMLElement>(".file-row__size")!;
  const dlBtn = row.querySelector<HTMLButtonElement>("[data-download]")!;
  const dlLabel = row.querySelector<HTMLElement>("[data-download-label]")!;

  nameEl.textContent = file.name;
  nameEl.title = file.name;
  sizeEl.textContent = formatBytes(file.size);

  dlBtn.addEventListener("click", async () => {
    dlBtn.disabled = true;
    const original = dlLabel.textContent;
    dlLabel.textContent = "Downloading…";
    try {
      await fetchDecryptAndSave(noteId, idx, dek, file.name, file.mime_type);
      const icon = dlBtn.querySelector("svg");
      if (icon) icon.replaceWith(svgIcon("Check", 14));
      dlLabel.textContent = "Saved";
    } catch (err) {
      dlLabel.textContent = "Failed";
      dlBtn.title = err instanceof Error ? err.message : "";
    }
    dlBtn.disabled = false;
    setTimeout(() => {
      if (dlLabel.textContent === "Saved" && original) {
        dlLabel.textContent = original;
        const icon = dlBtn.querySelector("svg");
        if (icon) icon.replaceWith(svgIcon("Download", 14));
      }
    }, 1500);
  });

  return row;
}

function showPasswordPrompt(salt: string): void {
  const prompt = mountPasswordPrompt(content, {
    onSubmit: async (password) => {
      prompt.setBusy(true);
      prompt.clearError();
      try {
        state.passwordHash = await recomputePasswordHash(password, salt);
        state.password = password;
      } catch {
        prompt.setError("Couldn't derive key.");
        prompt.setBusy(false);
        return;
      }

      try {
        state.ciphertext = await getNote(noteId, state.passwordHash);
      } catch (err) {
        prompt.setBusy(false);
        if (err instanceof ApiError && err.status === 401) {
          prompt.setError("Wrong password.");
          return;
        }
        handleFetchError(err);
        return;
      }
      await tryDecryptAndRender();
    },
  });
}

function showLinkIncomplete(body: string): void {
  const tpl = document.getElementById("t-link-incomplete") as HTMLTemplateElement;
  const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
  node.querySelector<HTMLElement>("[data-incomplete-body]")!.textContent = body;

  const form = node.querySelector<HTMLFormElement>("[data-incomplete-form]")!;
  const urlInput = node.querySelector<HTMLInputElement>("[data-incomplete-url]")!;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const parsed = parseShareURL(urlInput.value.trim());
    if (!parsed) {
      urlInput.focus();
      urlInput.select();
      return;
    }
    if (parsed.id !== noteId) {
      // Different note — navigate
      location.href = `/${parsed.id}#${parsed.key}`;
      return;
    }
    state.fragmentKey = parsed.key;
    writeFragment(parsed.key);
    if (state.ciphertext) {
      // Already burned a view — just retry decrypt without re-fetching
      void tryDecryptAndRender();
    } else {
      void start();
    }
  });

  content.replaceChildren(node);
  renderIcons(content);
  requestAnimationFrame(() => urlInput.focus());
}

function showStatus(title: string, body: string): void {
  const tpl = document.getElementById("t-status") as HTMLTemplateElement;
  const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
  node.querySelector<HTMLElement>("[data-status-title]")!.textContent = title;
  const bodyEl = node.querySelector<HTMLElement>("[data-status-body]")!;
  if (body) bodyEl.textContent = body;
  else bodyEl.remove();
  content.replaceChildren(node);
}

function showLoading(): void {
  const tpl = document.getElementById("t-loading") as HTMLTemplateElement;
  const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
  content.replaceChildren(node);
}
