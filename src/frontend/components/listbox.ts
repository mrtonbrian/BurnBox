/**
 * Wire a listbox-trigger button + <dialog> popover into a working custom
 * select. Markup lives in HTML; this handles open/close, keyboard nav,
 * mobile bottom-sheet positioning, and selection state.
 */

export interface ListboxController {
  get value(): string;
  setValue(value: string): void;
}

export function enhanceListbox(
  trigger: HTMLButtonElement,
  popover: HTMLDialogElement,
  onChange: (value: string) => void,
): ListboxController {
  const triggerLabel = trigger.querySelector<HTMLElement>(".listbox-trigger__label");
  const options = Array.from(popover.querySelectorAll<HTMLButtonElement>("[role='option']"));
  let current =
    options.find((o) => o.getAttribute("aria-selected") === "true")?.dataset.value ??
    options[0]?.dataset.value ??
    "";
  let activeIndex = options.findIndex((o) => o.dataset.value === current);
  if (activeIndex < 0) activeIndex = 0;

  function syncTrigger(): void {
    const opt = options.find((o) => o.dataset.value === current);
    if (triggerLabel && opt) {
      triggerLabel.textContent = opt.querySelector("span")?.textContent ?? "";
    }
    trigger.dataset.value = current;
  }

  function syncOptions(): void {
    options.forEach((o, i) => {
      o.setAttribute("aria-selected", String(o.dataset.value === current));
      o.dataset.active = String(i === activeIndex);
    });
  }

  function setActive(index: number): void {
    activeIndex = Math.max(0, Math.min(options.length - 1, index));
    syncOptions();
    options[activeIndex]?.focus();
  }

  function select(value: string): void {
    if (value === current) {
      close();
      return;
    }
    current = value;
    activeIndex = options.findIndex((o) => o.dataset.value === value);
    syncTrigger();
    syncOptions();
    onChange(value);
    close();
  }

  function open(): void {
    activeIndex = options.findIndex((o) => o.dataset.value === current);
    if (activeIndex < 0) activeIndex = 0;
    syncOptions();

    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    if (!isMobile) {
      const rect = trigger.getBoundingClientRect();
      popover.style.position = "fixed";
      popover.style.left = `${rect.left}px`;
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.minWidth = `${rect.width}px`;
      popover.style.margin = "0";
    } else {
      // Reset desktop positioning so CSS bottom-sheet rules apply
      popover.style.position = "";
      popover.style.left = "";
      popover.style.top = "";
      popover.style.minWidth = "";
      popover.style.margin = "";
    }

    popover.showModal();
    requestAnimationFrame(() => options[activeIndex]?.focus());
  }

  function close(): void {
    if (popover.open) popover.close();
  }

  trigger.addEventListener("click", () => open());

  popover.addEventListener("click", (e) => {
    if (e.target === popover) close();
  });

  popover.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt?.dataset.value) select(opt.dataset.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    }
  });

  options.forEach((opt, i) => {
    opt.addEventListener("click", () => {
      if (opt.dataset.value) select(opt.dataset.value);
    });
    opt.addEventListener("mousemove", () => {
      activeIndex = i;
      syncOptions();
    });
  });

  syncTrigger();
  syncOptions();

  return {
    get value() {
      return current;
    },
    setValue(v) {
      current = v;
      activeIndex = options.findIndex((o) => o.dataset.value === v);
      if (activeIndex < 0) activeIndex = 0;
      syncTrigger();
      syncOptions();
    },
  };
}
