/**
 * Create page entry. Wires up the form in index.html: file attaching,
 * settings controls, password toggle, and the encrypt → upload → finalize
 * flow. After submit, replaces the form with the share panel.
 */

import { generateDEK, encrypt, wrapDEK, derivePasswordHash } from "@shared/crypto.js";
import { MAX_TOTAL_SIZE } from "@shared/constants.js";
import type { NoteContent } from "@shared/types.js";
import { createNote, finalizeNote } from "./lib/api.js";
import { encryptAndUpload } from "./lib/upload.js";
import { buildShareURL } from "./lib/url-fragment.js";
import { renderIcons } from "./components/icons.js";
import { enhanceSegmented } from "./components/segmented.js";
import { enhanceListbox } from "./components/listbox.js";
import { enhanceDropZone } from "./components/drop-zone.js";
import { appendFileRow } from "./components/file-list.js";
import type { FileRowHandle } from "./components/file-list.js";
import { mountSharePanel } from "./components/share-panel.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface AttachedFile {
  file: File;
  handle: FileRowHandle;
}

const form = document.getElementById("create-form") as HTMLFormElement;
const noteInput = document.getElementById("note-input") as HTMLTextAreaElement;
const notePreview = document.getElementById("note-preview") as HTMLElement;
const tabWrite = document.getElementById("tab-write") as HTMLButtonElement;
const tabPreview = document.getElementById("tab-preview") as HTMLButtonElement;
const filesList = document.getElementById("files-list") as HTMLElement;
const dropZoneRoot = document.getElementById("drop-zone") as HTMLElement;
const dropZoneLabel = document.getElementById("drop-zone-label") as HTMLElement;
const expiryRoot = document.getElementById("expiry") as HTMLElement;
const maxViewsTrigger = document.getElementById("max-views-trigger") as HTMLButtonElement;
const maxViewsPopover = document.getElementById("max-views-popover") as HTMLDialogElement;
const passwordToggle = document.getElementById("password-toggle") as HTMLElement;
const passwordToggleButton = document.getElementById("password-toggle-button") as HTMLButtonElement;
const passwordCollapse = document.getElementById("password-collapse") as HTMLElement;
const passwordInput = document.getElementById("password-input") as HTMLInputElement;
passwordCollapse.inert = true;
const formError = document.getElementById("form-error") as HTMLElement;
const submitButton = document.getElementById("submit-button") as HTMLButtonElement;

renderIcons();

// ---- State ----
const attached: AttachedFile[] = [];
const expiry = enhanceSegmented(expiryRoot, () => {
  /* state kept inline below */
});
const maxViews = enhanceListbox(maxViewsTrigger, maxViewsPopover, () => {
  /* state kept inline below */
});
let passwordOn = false;

// ---- Auto-grow textarea ----
const autoGrow = (): void => {
  noteInput.style.height = "auto";
  noteInput.style.height = `${noteInput.scrollHeight}px`;
};
noteInput.addEventListener("input", autoGrow);

// ---- Write / Preview tabs ----
function showWriteTab(): void {
  tabWrite.setAttribute("aria-selected", "true");
  tabPreview.setAttribute("aria-selected", "false");
  notePreview.hidden = true;
  notePreview.style.minHeight = "";
  noteInput.hidden = false;
  noteInput.focus();
}

function showPreviewTab(): void {
  // Match preview min-height to current textarea height to avoid layout jump.
  const taHeight = noteInput.offsetHeight;

  const text = noteInput.value;
  if (!text.trim()) {
    notePreview.classList.add("note-preview--empty");
    notePreview.replaceChildren(document.createTextNode("Nothing to preview."));
  } else {
    notePreview.classList.remove("note-preview--empty");
    const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string, {
      ADD_ATTR: ["target", "rel"],
    });
    notePreview.innerHTML = html;
  }

  tabWrite.setAttribute("aria-selected", "false");
  tabPreview.setAttribute("aria-selected", "true");
  noteInput.hidden = true;
  notePreview.hidden = false;
  notePreview.style.minHeight = `${taHeight}px`;
}

tabWrite.addEventListener("click", showWriteTab);
tabPreview.addEventListener("click", showPreviewTab);

// ---- Drop zone ----
enhanceDropZone({
  root: dropZoneRoot,
  label: dropZoneLabel,
  onFiles: (files) => {
    const incomingTotal = files.reduce((s, f) => s + f.size, 0);
    const currentTotal = attached.reduce((s, a) => s + a.file.size, 0);
    if (currentTotal + incomingTotal > MAX_TOTAL_SIZE) {
      showError("Files exceed 100 MB total.");
      return;
    }
    clearError();
    for (const file of files) {
      const handle = appendFileRow(filesList, file, () => {
        const idx = attached.findIndex((a) => a.handle === handle);
        if (idx >= 0) {
          attached.splice(idx, 1);
          handle.remove();
        }
      });
      attached.push({ file, handle });
    }
  },
});

// ---- Password toggle ----
function expandCollapse(el: HTMLElement): void {
  const inner = el.firstElementChild as HTMLElement | null;
  if (inner) {
    el.style.setProperty("--collapse-height", `${inner.offsetHeight}px`);
  }
  el.dataset.open = "true";
}

function collapseCollapse(el: HTMLElement): void {
  el.dataset.open = "false";
}

passwordToggleButton.addEventListener("click", () => {
  passwordOn = !passwordOn;
  passwordToggle.dataset.on = String(passwordOn);
  passwordToggleButton.setAttribute("aria-pressed", String(passwordOn));
  passwordCollapse.inert = !passwordOn;
  if (passwordOn) {
    expandCollapse(passwordCollapse);
    requestAnimationFrame(() => passwordInput.focus());
  } else {
    collapseCollapse(passwordCollapse);
    passwordInput.value = "";
  }
});

// ---- Submit ----
function showError(msg: string): void {
  formError.textContent = msg;
}
function clearError(): void {
  formError.textContent = "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const noteText = noteInput.value;
  if (!noteText.trim() && attached.length === 0) {
    showError("Add a note or attach a file.");
    return;
  }
  if (passwordOn && !passwordInput.value) {
    showError("Enter a password or turn off password protection.");
    passwordInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Encrypting…";

  try {
    const dek = await generateDEK();
    const payload: NoteContent = {
      body: noteText,
      files: attached.map((a) => ({
        name: a.file.name,
        size: a.file.size,
        mime_type: a.file.type || "application/octet-stream",
      })),
    };
    const encryptedNote = await encrypt(JSON.stringify(payload), dek);
    const expiresAt = Math.floor(Date.now() / 1000) + Number(expiry.value) * 3600;
    const maxViewsNum = Number(maxViews.value);

    const { id } = await createNote({
      note_content: encryptedNote,
      expires_at: expiresAt,
      max_views: maxViewsNum,
      file_count: attached.length,
    });

    submitButton.textContent = attached.length > 0 ? "Uploading…" : "Sending…";

    // Hide remove buttons during upload (safer UX)
    filesList.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((b) => b.remove());

    for (let i = 0; i < attached.length; i++) {
      const entry = attached[i];
      if (!entry) continue;
      await encryptAndUpload(id, i, entry.file, dek, ({ loaded, total }) => {
        entry.handle.setProgress(total > 0 ? loaded / total : 0);
      });
      entry.handle.markDone();
    }

    submitButton.textContent = "Finalizing…";
    let passwordHash: string | undefined;
    let fragmentKey = dek;
    if (passwordOn && passwordInput.value) {
      passwordHash = await derivePasswordHash(passwordInput.value);
      fragmentKey = await wrapDEK(dek, passwordInput.value);
    }
    await finalizeNote(id, passwordHash ? { password_hash: passwordHash } : {});

    const url = buildShareURL(id, fragmentKey);
    mountSharePanel(form, {
      url,
      maxViews: maxViewsNum,
      expiresAt,
    });
  } catch (err) {
    submitButton.disabled = false;
    submitButton.textContent = "Send privately";
    showError(err instanceof Error ? err.message : "Something went wrong.");
  }
});

// Delay focus until after the form's fade-in (~200ms) so the cursor doesn't
// blink in mid-fade. Skip the delay when the user prefers reduced motion.
const focusDelayMs = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 250;
setTimeout(() => noteInput.focus(), focusDelayMs);
