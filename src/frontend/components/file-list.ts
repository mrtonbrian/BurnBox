/**
 * Helpers for cloning the `t-file-row` template and updating its state.
 * Markup lives in HTML; this only fills slots and updates progress.
 */

import { formatBytes } from "../lib/download.js";
import { resolveFileIcon } from "../lib/file-icons.js";
import { renderIcons, svgIcon } from "./icons.js";

export interface FileRowHandle {
  row: HTMLElement;
  setProgress(fraction: number): void;
  markDone(): void;
  markError(message: string): void;
  dispose(): void;
  remove(): void;
}

function canPreview(file: File): boolean {
  if (file.type === "image/svg+xml") return false;
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

function renderFallbackIcon(slot: HTMLElement, file: File): void {
  slot.classList.remove("file-row__media--preview");
  slot.replaceChildren(svgIcon(resolveFileIcon(file), 16));
}

function videoPreviewSrc(url: string): string {
  return `${url}#t=0.001`;
}

function setExpanded(
  row: HTMLElement,
  button: HTMLButtonElement,
  panel: HTMLElement,
  open: boolean,
): void {
  row.dataset.previewOpen = String(open);
  button.setAttribute("aria-expanded", String(open));

  if (open) {
    panel.hidden = false;
    panel.dataset.state = "opening";
    panel.style.height = "0px";

    requestAnimationFrame(() => {
      if (panel.dataset.state !== "opening") return;
      panel.style.height = `${panel.scrollHeight}px`;
      panel.dataset.state = "open";
    });

    setTimeout(() => {
      if (panel.dataset.state !== "open") return;
      panel.style.height = "auto";
    }, 180);
  } else {
    panel.querySelector("video")?.pause();
    panel.style.height = `${panel.scrollHeight}px`;
    panel.dataset.state = "closing";

    requestAnimationFrame(() => {
      if (panel.dataset.state !== "closing") return;
      panel.style.height = "0px";
    });

    setTimeout(() => {
      if (panel.dataset.state !== "closing") return;
      panel.hidden = true;
      panel.style.height = "";
      delete panel.dataset.state;
    }, 180);
  }
}

/**
 * Clone the `<template id="t-file-row">` and bind it to a File entry.
 *
 * @param container - parent element that the new row is appended to
 * @param file      - File metadata; only name + size are read
 * @param onRemove  - if provided, the remove button stays; otherwise it's hidden
 */
export function appendFileRow(
  container: HTMLElement,
  file: File,
  onRemove?: () => void,
): FileRowHandle {
  const tpl = document.getElementById("t-file-row") as HTMLTemplateElement;
  const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;

  const mediaSlot = node.querySelector<HTMLElement>(".file-row__media")!;
  const nameEl = node.querySelector<HTMLElement>(".file-row__name")!;
  const sizeEl = node.querySelector<HTMLElement>(".file-row__size")!;
  const progressEl = node.querySelector<HTMLElement>(".file-row__progress")!;
  const removeBtn = node.querySelector<HTMLButtonElement>("[data-remove]");
  let previewUrl: string | undefined;
  let previewPanel: HTMLElement | undefined;

  const dispose = (): void => {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
  };

  const downgradePreview = (): void => {
    previewPanel?.remove();
    previewPanel = undefined;
    renderFallbackIcon(mediaSlot, file);
    dispose();
  };

  nameEl.textContent = file.name;
  nameEl.title = file.name;
  sizeEl.textContent = formatBytes(file.size);

  if (canPreview(file)) {
    previewUrl = URL.createObjectURL(file);
    mediaSlot.classList.add("file-row__media--preview");

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "file-row__preview-trigger";
    previewButton.setAttribute("aria-label", `Preview ${file.name}`);
    previewButton.setAttribute("aria-expanded", "false");

    const overlay = document.createElement("span");
    overlay.className = "file-row__preview-icon";
    overlay.appendChild(svgIcon(file.type.startsWith("video/") ? "Play" : "Eye", 14));

    if (file.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.src = previewUrl;
      image.addEventListener("error", downgradePreview, { once: true });
      previewButton.appendChild(image);
    } else {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = videoPreviewSrc(previewUrl);
      video.addEventListener("error", downgradePreview, { once: true });
      previewButton.appendChild(video);
    }

    previewButton.appendChild(overlay);
    mediaSlot.replaceChildren(previewButton);

    previewPanel = document.createElement("div");
    previewPanel.className = "file-row__expanded";
    previewPanel.hidden = true;

    if (file.type.startsWith("image/")) {
      const expandedImage = document.createElement("img");
      expandedImage.alt = file.name;
      expandedImage.src = previewUrl;
      previewPanel.appendChild(expandedImage);
    } else {
      const expandedVideo = document.createElement("video");
      expandedVideo.controls = true;
      expandedVideo.playsInline = true;
      expandedVideo.preload = "metadata";
      expandedVideo.src = videoPreviewSrc(previewUrl);
      previewPanel.appendChild(expandedVideo);
    }

    previewButton.addEventListener("click", () => {
      if (!previewPanel) return;
      const isOpen = previewButton.getAttribute("aria-expanded") === "true";
      setExpanded(node, previewButton, previewPanel, !isOpen);
    });

    node.appendChild(previewPanel);
  } else {
    renderFallbackIcon(mediaSlot, file);
  }

  if (onRemove && removeBtn) {
    removeBtn.setAttribute("aria-label", `Remove ${file.name}`);
    removeBtn.addEventListener("click", () => onRemove());
  } else {
    removeBtn?.remove();
  }

  container.appendChild(node);
  renderIcons(node);

  return {
    row: node,
    setProgress(fraction) {
      const f = Math.max(0, Math.min(1, fraction));
      progressEl.style.transform = `scaleX(${f})`;
      node.dataset.state = f >= 1 ? "done" : "uploading";
    },
    markDone() {
      progressEl.style.transform = "scaleX(1)";
      node.dataset.state = "done";
    },
    markError(message) {
      node.dataset.state = "error";
      node.title = message;
    },
    dispose,
    remove() {
      dispose();
      node.remove();
    },
  };
}
