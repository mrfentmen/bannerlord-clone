/**
 * A very small typed DOM builder.
 *
 * No framework, on purpose. `CONSTITUTION.md` section 3.4 forbids an invented design
 * system, and every UI framework arrives with its own palette, its own spacing scale
 * and its own opinion about what a card is. A hundred lines here keeps the tokens in
 * `src/design` as the only source of visual truth.
 */

export type Child = Node | string | number | null | undefined | false | Child[];
/** Anything that can be appended into the tree, minus the primitives `Child` allows. */
export type ChildNode = Node;

export interface Attrs {
  class?: string;
  id?: string;
  /** Any ARIA attribute, plus the data attributes the tests assert on. */
  [key: string]: string | number | boolean | null | undefined | EventListener;
}

/** `h("div", { class: "x" }, "text")`. Void elements are handled. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "text") {
      el.textContent = String(value);
    } else if (value === true) {
      // An ARIA attribute takes the *string* "true". Setting the empty string, which is
      // what a bare boolean would produce, is not a valid token, and an assistive tech
      // reading `aria-hidden=""` is not reliably told the element is hidden. Boolean
      // ARIA is common enough in this codebase to be worth getting right in one place.
      el.setAttribute(key, key.startsWith("aria-") ? "true" : "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      append(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function replace(node: Element, ...children: Child[]): void {
  clear(node);
  append(node, children);
}

/** A button that is genuinely a button: real element, real focus, real name. */
export function button(
  label: string,
  onClick: () => void,
  opts: { variant?: "primary" | "plain" | "quiet"; disabled?: boolean; describedBy?: string; testId?: string } = {},
): HTMLButtonElement {
  const el = h("button", {
    type: "button",
    "data-testid": opts.testId,
    "aria-describedby": opts.describedBy,
    disabled: opts.disabled ?? false,
    class: `btn btn--${opts.variant ?? "plain"}`,
  });
  el.appendChild(h("span", { class: "btn__label" }, label));
  el.addEventListener("click", onClick);
  return el;
}

/** A labelled numeric field. Every input has a real `<label>`. */
export function numberField(
  id: string,
  label: string,
  value: number,
  opts: { min?: number; max?: number; step?: number; onChange?: (v: number) => void } = {},
): { field: HTMLElement; input: HTMLInputElement } {
  const input = h("input", {
    type: "number",
    id,
    value: String(value),
    min: opts.min,
    max: opts.max,
    step: opts.step ?? 1,
    inputmode: "numeric",
    class: "field__input data",
  });
  if (opts.onChange) {
    input.addEventListener("change", () => {
      const next = Number(input.value);
      if (Number.isFinite(next)) opts.onChange?.(next);
    });
  }
  const field = h("div", { class: "field" }, h("label", { class: "field__label label", for: id }, label), input);
  return { field, input };
}

/** A definition-list row. Used everywhere a label sits beside a value. */
export function row(label: string, value: Node | string, opts: { mono?: boolean; testId?: string } = {}): HTMLElement {
  return h(
    "div",
    { class: "row" },
    h("span", { class: "row__label label" }, label),
    h("span", { class: opts.mono ? "row__value data" : "row__value", "data-testid": opts.testId }, value),
  );
}

export function sectionHeader(text: string, extra?: Node): HTMLElement {
  return h(
    "section",
    { class: "panel__section" },
    h("h3", { class: "section-header" }, h("span", {}, text), extra ?? null),
    h("hr", { class: "form-rule" }),
  );
}

/** A live region, for announcing map selection and connection changes. */
export function liveRegion(initial = ""): HTMLElement {
  return h("div", { class: "visually-hidden", role: "status", "aria-live": "polite", "aria-atomic": "true" }, initial);
}

export function announce(region: HTMLElement, message: string): void {
  region.textContent = message;
}
