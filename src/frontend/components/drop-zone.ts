/**
 * Wire a `<label class="drop-zone">` element to forward dropped or chosen
 * files to a callback. Labels and the hidden `<input type="file">` are in
 * the HTML; this only handles drag/drop state and event forwarding.
 */

export interface DropZoneOptions {
  /** Element that wraps the drop area. Must contain an <input type="file">. */
  root: HTMLElement;
  /** Element whose textContent is updated to reflect drag state. */
  label: HTMLElement;
  /** Default copy when not dragging. */
  defaultLabel?: string;
  /** Copy when a drag is over the zone. */
  draggingLabel?: string;
  onFiles: (files: File[]) => void;
}

export function enhanceDropZone(opts: DropZoneOptions): void {
  const fileInput = opts.root.querySelector<HTMLInputElement>("input[type='file']");
  if (!fileInput) throw new Error("drop-zone is missing <input type='file'>");

  const isMobile = window.matchMedia("(max-width: 720px)").matches;
  const defaultLabel =
    opts.defaultLabel ?? (isMobile ? "Tap to attach files" : "Drop files or click to attach");
  const draggingLabel = opts.draggingLabel ?? "Drop to attach";
  opts.label.textContent = defaultLabel;

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) {
      opts.onFiles(Array.from(fileInput.files));
      fileInput.value = "";
    }
  });

  opts.root.addEventListener("dragover", (e) => {
    e.preventDefault();
    opts.root.dataset.dragging = "true";
    opts.label.textContent = draggingLabel;
  });

  opts.root.addEventListener("dragleave", (e) => {
    e.preventDefault();
    opts.root.dataset.dragging = "false";
    opts.label.textContent = defaultLabel;
  });

  opts.root.addEventListener("drop", (e) => {
    e.preventDefault();
    opts.root.dataset.dragging = "false";
    opts.label.textContent = defaultLabel;
    if (e.dataTransfer?.files.length) {
      opts.onFiles(Array.from(e.dataTransfer.files));
    }
  });
}
