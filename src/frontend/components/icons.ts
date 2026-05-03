/**
 * Lucide icon registration. Renders `<i data-lucide="name">` placeholders
 * to inline SVGs. Only the icons we actually use are imported, so the bundle
 * stays small.
 */

import {
  Paperclip,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  ChevronDown,
  File as FileIcon,
  Download,
  TriangleAlert,
  Flame,
  createIcons,
  createElement,
} from "lucide";
import type { IconNode } from "lucide";

const REGISTRY = {
  Paperclip,
  X,
  Copy,
  Check,
  Eye,
  EyeOff,
  ChevronDown,
  File: FileIcon,
  Download,
  TriangleAlert,
  Flame,
} as const;

/**
 * Replace all `<i data-lucide="name">` placeholders within `root` (default:
 * the whole document) with their corresponding SVG.
 */
export function renderIcons(root?: Element): void {
  createIcons({
    icons: REGISTRY,
    ...(root ? { root: root as HTMLElement } : {}),
  });
}

/**
 * Build a single SVG element directly. Useful for icons we need to swap at
 * runtime (e.g. Copy → Check after clipboard write).
 */
export function svgIcon(name: keyof typeof REGISTRY, size = 14): SVGElement {
  return createElement(REGISTRY[name] as IconNode, {
    width: size,
    height: size,
    "aria-hidden": "true",
  });
}
