/**
 * Mount a password prompt by cloning the `t-password-prompt` template into
 * `target`. Wires the eye-toggle and submit button.
 */

import { renderIcons, svgIcon } from "./icons.js";

export interface PasswordPromptOptions {
  onSubmit: (password: string) => void | Promise<void>;
  submitLabel?: string;
}

export interface PasswordPromptHandle {
  setError(message: string): void;
  clearError(): void;
  setBusy(busy: boolean): void;
  focus(): void;
}

export function mountPasswordPrompt(
  target: HTMLElement,
  opts: PasswordPromptOptions,
): PasswordPromptHandle {
  const tpl = document.getElementById("t-password-prompt") as HTMLTemplateElement;
  const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;

  const form = node.querySelector<HTMLFormElement>("[data-password-form]")!;
  const input = node.querySelector<HTMLInputElement>("[data-password-input]")!;
  const toggle = node.querySelector<HTMLButtonElement>("[data-password-toggle]")!;
  const error = node.querySelector<HTMLElement>("[data-password-error]")!;
  const submit = node.querySelector<HTMLButtonElement>("[data-password-submit]")!;

  if (opts.submitLabel) submit.textContent = opts.submitLabel;

  let visible = false;
  toggle.addEventListener("click", () => {
    visible = !visible;
    input.type = visible ? "text" : "password";
    toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    toggle.replaceChildren(svgIcon(visible ? "EyeOff" : "Eye", 14));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.value) return;
    await opts.onSubmit(input.value);
  });

  target.replaceChildren(node);
  renderIcons(node);
  requestAnimationFrame(() => input.focus());

  return {
    setError(message) {
      error.textContent = message;
      input.value = "";
      input.focus();
    },
    clearError() {
      error.textContent = "";
    },
    setBusy(busy) {
      submit.disabled = busy;
      input.disabled = busy;
      submit.textContent = busy ? "Unlocking…" : (opts.submitLabel ?? "Unlock");
    },
    focus() {
      requestAnimationFrame(() => input.focus());
    },
  };
}
