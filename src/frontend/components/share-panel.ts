/**
 * Clone the `t-share` template, populate it, and replace `target` with it.
 * Wires the Copy button with a click → "Copied" → revert state machine.
 */

import { renderIcons, svgIcon } from "./icons.js";

export interface SharePanelOptions {
  url: string;
  maxViews: number;
  expiresAt: number; // unix seconds
}

export function mountSharePanel(target: HTMLElement, opts: SharePanelOptions): HTMLElement {
  const tpl = document.getElementById("t-share") as HTMLTemplateElement;
  const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;

  const urlEl = node.querySelector<HTMLElement>("[data-share-url]")!;
  const viewsEl = node.querySelector<HTMLElement>("[data-share-views]")!;
  const expiresEl = node.querySelector<HTMLElement>("[data-share-expires]")!;
  const copyBtn = node.querySelector<HTMLButtonElement>("[data-copy]")!;
  const copyIcon = node.querySelector<HTMLElement>("[data-copy-icon]")!;
  const copyLabel = node.querySelector<HTMLElement>("[data-copy-label]")!;

  urlEl.textContent = opts.url;
  viewsEl.textContent =
    opts.maxViews === 1 ? "Burns after 1 view" : `Burns after ${opts.maxViews} views`;
  expiresEl.textContent = `Expires ${formatExpiry(opts.expiresAt)}`;

  // Pin the button width so the Copy → Copied swap doesn't reflow.
  copyBtn.style.minWidth = "120px";

  let resetHandle: number | undefined;
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(opts.url);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(urlEl);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand("copy");
      sel?.removeAllRanges();
    }
    copyLabel.textContent = "Copied";
    copyIcon.replaceChildren(svgIcon("Check", 14));
    window.clearTimeout(resetHandle);
    resetHandle = window.setTimeout(() => {
      copyLabel.textContent = "Copy link";
      copyIcon.replaceChildren(svgIcon("Copy", 14));
    }, 1500);
  });

  target.replaceWith(node);
  renderIcons(node);
  return node;
}

function formatExpiry(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const diffMs = date.getTime() - Date.now();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `in ${diffHours} ${diffHours === 1 ? "hour" : "hours"}`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 14) return `in ${diffDays} ${diffDays === 1 ? "day" : "days"}`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
