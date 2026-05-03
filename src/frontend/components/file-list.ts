/**
 * Helpers for cloning the `t-file-row` template and updating its state.
 * Markup lives in HTML; this only fills slots and updates progress.
 */

import { formatBytes } from "../lib/download.js";
import { renderIcons } from "./icons.js";

export interface FileRowHandle {
  row: HTMLElement;
  setProgress(fraction: number): void;
  markDone(): void;
  markError(message: string): void;
  remove(): void;
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

  const nameEl = node.querySelector<HTMLElement>(".file-row__name")!;
  const sizeEl = node.querySelector<HTMLElement>(".file-row__size")!;
  const progressEl = node.querySelector<HTMLElement>(".file-row__progress")!;
  const removeBtn = node.querySelector<HTMLButtonElement>("[data-remove]");

  nameEl.textContent = file.name;
  nameEl.title = file.name;
  sizeEl.textContent = formatBytes(file.size);

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
    remove() {
      node.remove();
    },
  };
}
