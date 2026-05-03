/**
 * Enhance a `<div role="radiogroup">` element with segmented-control behavior.
 * Reads `data-value` from each child button; the initial selection is
 * whichever button has `aria-checked="true"` (or the first if none).
 */

export interface SegmentedController {
  get value(): string;
  setValue(value: string): void;
}

export function enhanceSegmented(
  root: HTMLElement,
  onChange: (value: string) => void,
): SegmentedController {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-value]"));
  let current =
    buttons.find((b) => b.getAttribute("aria-checked") === "true")?.dataset.value ??
    buttons[0]?.dataset.value ??
    "";

  function set(value: string, focus = false): void {
    if (value === current) return;
    current = value;
    buttons.forEach((b) => {
      const checked = b.dataset.value === value;
      b.setAttribute("aria-checked", String(checked));
      b.tabIndex = checked ? 0 : -1;
      if (checked && focus) b.focus();
    });
    onChange(value);
  }

  buttons.forEach((b) => {
    b.tabIndex = b.dataset.value === current ? 0 : -1;
    b.addEventListener("click", () => set(b.dataset.value!));
    b.addEventListener("keydown", (e) => {
      const idx = buttons.indexOf(b);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = buttons[(idx + 1) % buttons.length];
        if (next?.dataset.value) set(next.dataset.value, true);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = buttons[(idx - 1 + buttons.length) % buttons.length];
        if (prev?.dataset.value) set(prev.dataset.value, true);
      }
    });
  });

  return {
    get value() {
      return current;
    },
    setValue: (v) => set(v),
  };
}
